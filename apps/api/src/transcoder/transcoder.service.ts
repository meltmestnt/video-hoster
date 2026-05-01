import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { mkdtemp, rm, stat } from "node:fs/promises";
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
      await rm(workDir, { recursive: true, force: true });
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
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
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
        .format("mp4")
        .on("end", () => resolve())
        .on("error", (err) =>
          reject(new Error(`ffmpeg failed: ${err.message}`)),
        )
        .save(outputPath);
    });
  }

  private deriveOutputKey(sourceKey: string): string {
    const lastSlash = sourceKey.lastIndexOf("/");
    const dir = lastSlash >= 0 ? sourceKey.slice(0, lastSlash) : "";
    return dir ? `${dir}/480p.mp4` : "480p.mp4";
  }
}
