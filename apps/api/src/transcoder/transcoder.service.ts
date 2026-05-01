import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { Video } from "../videos/video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { S3Service } from "../s3/s3.service";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

export interface TranscodeResult {
  key: string;
  sizeBytes: number;
  mimeType: "video/mp4";
}

@Injectable()
export class TranscoderService {
  private readonly logger = new Logger(TranscoderService.name);

  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Thumbnail)
    private readonly thumbnails: Repository<Thumbnail>,
    private readonly s3: S3Service,
  ) {}

  async generateThumbnail(videoId: string): Promise<Thumbnail | null> {
    if (!ffmpegStatic) {
      this.logger.warn("ffmpeg unavailable; skipping thumbnail generation");
      return null;
    }
    const video = await this.videos.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException("Video not found");

    const workDir = await mkdtemp(join(tmpdir(), "vidly-thumb-"));
    const inputPath = join(workDir, "input");
    const outputPath = join(workDir, "thumb.jpg");

    try {
      // Download the source first instead of streaming through a presigned URL.
      // The static ffmpeg binary on some hosts is missing HTTPS support or
      // misbehaves with range-seek over signed URLs, which silently produces
      // no thumbnail.
      await this.s3.downloadToFile(video.s3Key, inputPath);

      try {
        await this.extractFrame(inputPath, outputPath, 1);
      } catch (err) {
        this.logger.warn(
          `Thumbnail seek to 1s failed (${(err as Error).message}); retrying at 0s`,
        );
        await this.extractFrame(inputPath, outputPath, 0);
      }

      const thumbKey = `videos/${video.id}/thumb-${Date.now()}.jpg`;
      await this.s3.uploadFile(thumbKey, outputPath, "image/jpeg");

      const row = this.thumbnails.create({
        videoId: video.id,
        s3Key: thumbKey,
      });
      return await this.thumbnails.save(row);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Re-encode a GIF to SD (≤ 480px wide) with a 2-pass palette pipeline
   * — the standard ffmpeg trick for shrinking GIFs without obvious
   * banding. Caps frame rate to 15 fps too. Returns the compressed
   * Buffer; the caller decides whether to keep it (we sometimes get
   * larger output for already-tiny GIFs).
   *
   * Idempotent and isolated: runs entirely in a temp dir which gets
   * removed on every exit path, so a poison input or an OOM can't
   * leak files into the runner's tmp.
   */
  async compressGifToSd(input: Buffer | string): Promise<Buffer> {
    if (!ffmpegStatic) {
      throw new Error("ffmpeg binary unavailable");
    }
    const workDir = await mkdtemp(join(tmpdir(), "gif-compress-"));
    // No extension on the input path — ffmpeg auto-detects from magic
    // bytes, which lets the same pipeline accept either a GIF *or* an
    // MP4. Telegram silently converts user-sent GIFs to MP4 (it stores
    // animations as MP4 internally), so the bot's animation handler
    // pipes the downloaded MP4 straight in here and gets a GIF out.
    const inputPath = join(workDir, "input");
    const outputPath = join(workDir, "output.gif");
    try {
      if (typeof input === "string") {
        // S3 key — download. Same defensive download dance the video
        // transcoder uses; ffmpeg over signed URLs is flaky.
        await this.s3.downloadToFile(input, inputPath);
      } else {
        await writeFile(inputPath, input);
      }
      await this.runGifFfmpeg(inputPath, outputPath);
      return await readFile(outputPath);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runGifFfmpeg(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    // GIF compression is bounded by file size (we already cap at 20 MB
    // per upload) and by frame count, but a pathological input could
    // still blow the cap — kill the job after 2 minutes either way.
    const TIMEOUT_MS = 2 * 60 * 1000;
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        // Two-pass palette pipeline. fps=15 caps frame rate (most GIFs
        // are 10-30 fps; 15 reads as smooth without being expensive),
        // scale clamps width to 480 keeping aspect ratio (-2 = round
        // height to even number, required for some encoders), and the
        // palette generation + use produces dramatically smaller output
        // than naive single-pass GIF re-encoding.
        .complexFilter([
          "fps=15,scale='min(480,iw)':-2:flags=lanczos,split[s0][s1]",
          "[s0]palettegen=stats_mode=diff[p]",
          "[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
        ])
        .outputOptions(["-loop", "0"])
        .format("gif");
      const timer = setTimeout(() => {
        try {
          cmd.kill("SIGKILL");
        } catch {
          // best-effort kill, the reject below is the contract
        }
        reject(
          new Error(
            `ffmpeg gif compress timed out after ${TIMEOUT_MS / 1000}s`,
          ),
        );
      }, TIMEOUT_MS);
      cmd
        .on("end", () => {
          clearTimeout(timer);
          resolve();
        })
        .on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`gif compress failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Transcode a stored GIF to a silent H.264 MP4 next to the source.
   * The Telegram inline-query handler hands Telegram the resulting URL
   * as `mpeg4_url` — InlineQueryResultGif silently drops items above
   * 1 MB while mpeg4_gif accepts much larger files (Telegram stores
   * "gifs" as MP4 internally anyway).
   *
   * Returns null when ffmpeg isn't available so callers can fall back
   * gracefully (the inline handler will skip rows without an mp4).
   */
  async gifToMp4(
    sourceKey: string,
    outputKey?: string,
  ): Promise<TranscodeResult | null> {
    if (!ffmpegStatic) {
      this.logger.warn("ffmpeg unavailable; skipping gif → mp4 transcode");
      return null;
    }

    const workDir = await mkdtemp(join(tmpdir(), "gif-to-mp4-"));
    const inputPath = join(workDir, "input.gif");
    const outputPath = join(workDir, "output.mp4");

    try {
      await this.s3.downloadToFile(sourceKey, inputPath);
      await this.runGifToMp4(inputPath, outputPath);

      const outKey = outputKey ?? this.deriveMp4Key(sourceKey);
      const stats = await stat(outputPath);
      this.logger.log(
        `transcoder.gifToMp4 src=${sourceKey} → ${outKey} (${stats.size} bytes)`,
      );
      await this.s3.uploadFile(outKey, outputPath, "video/mp4");
      return { key: outKey, sizeBytes: stats.size, mimeType: "video/mp4" };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runGifToMp4(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    // GIFs are bounded to 20 MB and 20 s on upload, so the encode is
    // always cheap. Two-minute cap mirrors the GIF-compress path; if a
    // pathological input does manage to hang ffmpeg, we'd rather fail
    // the job than hold a worker forever.
    const TIMEOUT_MS = 2 * 60 * 1000;
    return new Promise((resolve, reject) => {
      // Animated-GIF demuxer treats per-frame "delay" centiseconds as
      // timestamps, producing an MP4 with broken mvhd.duration. Two
      // counter-measures:
      //
      //   • -vsync cfr + -r 25 forces a constant-rate timeline
      //     instead of preserving the GIF's variable per-frame timing,
      //     so mvhd.duration ends up as a real number rather than 0.
      //   • -t 20 caps output duration. GIFs are bounded to 20 s on
      //     upload, so this is a no-op for valid input — but it's a
      //     hard safety net against ffmpeg looping a `loop=0` GIF
      //     forever (cf. the earlier `-ignore_loop 0` regression that
      //     produced 12-minute outputs and timed out the encoder).
      //
      // Even-pixel scale stays (H.264 hard rule); faststart moves moov
      // to the top so previews start without the full download.
      const cmd = ffmpeg(inputPath)
        .noAudio()
        .videoCodec("libx264")
        .videoFilter("scale=trunc(iw/2)*2:trunc(ih/2)*2")
        .outputOptions([
          "-r 25",
          "-vsync cfr",
          "-t 20",
          "-pix_fmt yuv420p",
          "-preset veryfast",
          "-crf 23",
          "-movflags +faststart",
        ])
        .format("mp4");

      // Capture ffmpeg's stderr — that's where it logs codec/container
      // warnings that explain why an output won't play. We surface the
      // tail on errors so the next run gives us something to debug.
      let stderrTail = "";
      cmd
        .on("start", (commandLine) => {
          this.logger.log(`ffmpeg.gifToMp4 cmd: ${commandLine}`);
        })
        .on("stderr", (line) => {
          stderrTail = `${stderrTail}${line}\n`.slice(-4096);
        });

      const timer = setTimeout(() => {
        try {
          cmd.kill("SIGKILL");
        } catch {
          // best-effort kill, reject below is the contract
        }
        reject(
          new Error(
            `ffmpeg gif→mp4 timed out after ${TIMEOUT_MS / 1000}s`,
          ),
        );
      }, TIMEOUT_MS);

      cmd
        .on("end", () => {
          clearTimeout(timer);
          resolve();
        })
        .on("error", (err) => {
          clearTimeout(timer);
          this.logger.warn(
            `ffmpeg.gifToMp4 stderr tail: ${stderrTail || "<empty>"}`,
          );
          reject(new Error(`gif→mp4 failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  private deriveMp4Key(sourceKey: string): string {
    const lastSlash = sourceKey.lastIndexOf("/");
    const dir = lastSlash >= 0 ? sourceKey.slice(0, lastSlash) : "";
    return dir ? `${dir}/animation.mp4` : "animation.mp4";
  }

  /**
   * Extract the first frame of a GIF as a small JPEG, uploaded next to
   * the source. This is what the Telegram inline-query handler hands
   * Telegram as `thumbnail_url` — the mpeg4_gif result is rendered with
   * a static JPEG preview, the way every working GIF bot does it. The
   * MP4 itself is fine as a thumbnail per Telegram's spec but Telegram's
   * inline previewer drops results when it can't render the thumbnail,
   * so we don't take chances.
   *
   * Width is clamped to 240 px which is a comfortable size for the
   * inline picker; quality 5 keeps the file in the tens-of-KB range.
   */
  async gifFirstFrameJpeg(
    sourceKey: string,
    outputKey?: string,
  ): Promise<{ key: string; sizeBytes: number } | null> {
    if (!ffmpegStatic) {
      this.logger.warn("ffmpeg unavailable; skipping gif thumbnail");
      return null;
    }
    const workDir = await mkdtemp(join(tmpdir(), "gif-thumb-"));
    const inputPath = join(workDir, "input.gif");
    const outputPath = join(workDir, "thumb.jpg");
    try {
      await this.s3.downloadToFile(sourceKey, inputPath);
      await this.extractFrame(inputPath, outputPath, 0);
      const outKey = outputKey ?? this.deriveThumbKey(sourceKey);
      const stats = await stat(outputPath);
      this.logger.log(
        `transcoder.gifFirstFrameJpeg src=${sourceKey} → ${outKey} (${stats.size} bytes)`,
      );
      await this.s3.uploadFile(outKey, outputPath, "image/jpeg");
      return { key: outKey, sizeBytes: stats.size };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private deriveThumbKey(sourceKey: string): string {
    const lastSlash = sourceKey.lastIndexOf("/");
    const dir = lastSlash >= 0 ? sourceKey.slice(0, lastSlash) : "";
    return dir ? `${dir}/thumb.jpg` : "thumb.jpg";
  }

  async compressTo480p(sourceKey: string): Promise<TranscodeResult> {
    if (!ffmpegStatic) {
      throw new Error(
        "ffmpeg binary unavailable on this platform (ffmpeg-static returned null)",
      );
    }

    const workDir = await mkdtemp(join(tmpdir(), "video-transcode-"));
    const inputPath = join(workDir, "input");
    const outputPath = join(workDir, "output.mp4");

    try {
      this.logger.log(`Downloading ${sourceKey} for transcode`);
      await this.s3.downloadToFile(sourceKey, inputPath);

      this.logger.log(`Transcoding ${sourceKey} → 480p H.264`);
      await this.runFfmpeg(inputPath, outputPath);

      const outKey = this.deriveOutputKey(sourceKey);
      const stats = await stat(outputPath);

      this.logger.log(
        `Uploading transcoded output to ${outKey} (${stats.size} bytes)`,
      );
      await this.s3.uploadFile(outKey, outputPath, "video/mp4");

      return { key: outKey, sizeBytes: stats.size, mimeType: "video/mp4" };
    } finally {
      // `force: true` swallows ENOENT and tolerates partial dirs (e.g. a
      // file Windows hasn't released yet) instead of surfacing as the
      // request error.
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private probeDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) return reject(err);
        const seconds = data.format?.duration;
        if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
          return resolve(0);
        }
        resolve(seconds);
      });
    });
  }

  private extractFrame(
    inputPath: string,
    outputPath: string,
    atSeconds: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        // `-ss` before `-i` = fast (keyframe) seek; ~constant time regardless
        // of file size since ffmpeg HTTP-range-seeks the source.
        .seekInput(Math.max(0, atSeconds))
        .frames(1)
        .outputOptions([
          "-q:v",
          "5",
          "-vf",
          "scale='min(640,iw)':-2",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) =>
          reject(new Error(`ffmpeg thumbnail failed: ${err.message}`)),
        )
        .run();
    });
  }

  private runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    // Cap per-job runtime. A poison input or a degenerate filter graph can
    // otherwise hang forever holding a tRPC request, the temp dir, and the
    // input file. Picked generously: a 5-minute 480p re-encode of even a
    // worst-case 1.5 GiB source on a slow runner finishes well under this.
    const TIMEOUT_MS = 10 * 60 * 1000;
    return new Promise((resolve, reject) => {
      const cmd = ffmpeg(inputPath)
        .videoCodec("libx264")
        .videoFilter("scale=-2:480")
        .outputOptions([
          "-preset medium",
          "-crf 23",
          "-pix_fmt yuv420p",
          "-movflags +faststart",
        ])
        .audioCodec("aac")
        .audioBitrate("128k")
        .format("mp4");

      const timer = setTimeout(() => {
        try {
          cmd.kill("SIGKILL");
        } catch {
          // ignore — best-effort kill, the reject below is the contract
        }
        reject(new Error(`ffmpeg timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);

      cmd
        .on("end", () => {
          clearTimeout(timer);
          resolve();
        })
        .on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`ffmpeg failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  private deriveOutputKey(sourceKey: string): string {
    const lastSlash = sourceKey.lastIndexOf("/");
    const dir = lastSlash >= 0 ? sourceKey.slice(0, lastSlash) : "";
    return dir ? `${dir}/480p.mp4` : "480p.mp4";
  }
}
