"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const FFMPEG_CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

let instance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return instance;
  if (loadPromise) return loadPromise;

  const ffmpeg = new FFmpeg();
  loadPromise = (async () => {
    // Wrap the core script and wasm in blob URLs so we don't run afoul of
    // any cross-origin import restrictions on the worker side.
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    ]);
    await ffmpeg.load({ coreURL, wasmURL });
    instance = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await loadPromise;
  } finally {
    loadPromise = null;
  }
}

export type Rotation = 0 | 90 | 180 | 270;
export type CropAspect = "original" | "16:9" | "4:3" | "1:1";

export interface EditOptions {
  // Inclusive trim range in seconds. Omitted = use full video.
  trimStart?: number;
  trimEnd?: number;
  // Clockwise rotation in 90° steps.
  rotation?: Rotation;
  // Center-crop to this aspect ratio.
  cropAspect?: CropAspect;
  // Multiplicative center-crop scale (1 = none, 2 = 2× zoom).
  zoom?: number;
  // Playback rate multiplier. 1 = normal, 0.5 = half speed, 2 = double.
  // Applied via setpts (video) and atempo (audio); range clamped to
  // [0.5, 4] in the editor since atempo only supports 0.5–100.
  playbackRate?: number;
  // Required when cropAspect != "original" or zoom > 1 — the editor
  // already loaded these from the <video> element.
  sourceWidth?: number;
  sourceHeight?: number;
}

// Builds an atempo filter chain that supports rates outside atempo's per-stage
// 0.5–100 limit by chaining multiple filters together.
function atempoChain(rate: number): string {
  if (rate <= 0 || rate === 1) return "";
  const filters: string[] = [];
  let r = rate;
  while (r < 0.5) {
    filters.push("atempo=0.5");
    r /= 0.5;
  }
  while (r > 2) {
    filters.push("atempo=2.0");
    r /= 2;
  }
  filters.push(`atempo=${r.toFixed(3)}`);
  return filters.join(",");
}

export interface CompressOptions {
  // Called repeatedly during loading (0..1) and again during the actual
  // transcode (0..1). The phase tells the caller which one.
  onPhase?: (phase: "loading" | "transcoding") => void;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
  edit?: EditOptions;
  // Skip the audio encoder. Set when the input has no audio stream (e.g. a
  // GIF) so ffmpeg doesn't try to spin up AAC against nothing.
  noAudio?: boolean;
}

function buildVideoFilters(edit: EditOptions | undefined): string {
  const filters: string[] = [];
  // Crop first (so rotation operates on the cropped frame).
  if (
    edit &&
    edit.sourceWidth &&
    edit.sourceHeight &&
    (edit.cropAspect && edit.cropAspect !== "original" ||
      (edit.zoom && edit.zoom > 1))
  ) {
    const sw = edit.sourceWidth;
    const sh = edit.sourceHeight;
    let cw = sw;
    let ch = sh;

    if (edit.cropAspect && edit.cropAspect !== "original") {
      const [a, b] = edit.cropAspect.split(":").map(Number);
      const target = a / b;
      const source = sw / sh;
      if (source > target) {
        ch = sh;
        cw = Math.round(sh * target);
      } else {
        cw = sw;
        ch = Math.round(sw / target);
      }
    }
    if (edit.zoom && edit.zoom > 1) {
      cw = Math.round(cw / edit.zoom);
      ch = Math.round(ch / edit.zoom);
    }
    // Round dims to even numbers (libx264 needs that).
    cw = Math.max(2, cw - (cw % 2));
    ch = Math.max(2, ch - (ch % 2));
    const x = Math.round((sw - cw) / 2);
    const y = Math.round((sh - ch) / 2);
    filters.push(`crop=${cw}:${ch}:${x}:${y}`);
  }

  if (edit?.rotation === 90) filters.push("transpose=1");
  else if (edit?.rotation === 180) filters.push("transpose=2,transpose=2");
  else if (edit?.rotation === 270) filters.push("transpose=2");

  // Speed change before resampling — we want fps=30 to apply to the new
  // (sped-up or slowed-down) timeline.
  if (edit?.playbackRate && edit.playbackRate !== 1 && edit.playbackRate > 0) {
    filters.push(`setpts=${(1 / edit.playbackRate).toFixed(4)}*PTS`);
  }

  // Existing 480p downscale + 30fps cap, applied last so any rotation
  // and crop happens before we resample.
  filters.push("scale=-2:480");
  filters.push("fps=30");
  return filters.join(",");
}

/**
 * Re-encodes the input file to 480p H.264/AAC mp4. Mirrors the server-side
 * preset (CRF 28 here vs. 23 on the server — slightly more aggressive to
 * keep wasm transcode times bearable).
 */
export async function compressTo480p(
  file: File,
  options: CompressOptions = {},
): Promise<Blob> {
  options.onPhase?.("loading");
  const ffmpeg = await getFFmpeg();
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const inputName = "input";
  const outputName = "output.mp4";

  // Fresh progress listener per call so concurrent runs don't trample
  // each other's callbacks (we do hold a single ffmpeg instance, but the
  // upload context only ever runs one at a time).
  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      // ffmpeg sometimes reports >1 near the end; clamp it.
      options.onProgress?.(Math.max(0, Math.min(1, progress)));
    }
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    options.onPhase?.("transcoding");
    options.onProgress?.(0);

    const args: string[] = [];
    // Input-level seek for trim start (fast, applied before decode).
    if (
      options.edit?.trimStart !== undefined &&
      options.edit.trimStart > 0
    ) {
      args.push("-ss", options.edit.trimStart.toFixed(3));
    }
    args.push("-i", inputName);
    if (
      options.edit?.trimEnd !== undefined &&
      options.edit.trimEnd > 0 &&
      (options.edit.trimStart === undefined ||
        options.edit.trimEnd > options.edit.trimStart)
    ) {
      const startOffset = options.edit?.trimStart ?? 0;
      // -t expects a duration relative to -ss
      args.push("-t", (options.edit.trimEnd - startOffset).toFixed(3));
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-vf",
      buildVideoFilters(options.edit),
    );
    if (options.noAudio) {
      args.push("-an");
    } else {
      args.push("-c:a", "aac", "-b:a", "128k");
      const audioTempo = options.edit?.playbackRate
        ? atempoChain(options.edit.playbackRate)
        : "";
      if (audioTempo) {
        args.push("-af", audioTempo);
      }
    }
    args.push("-movflags", "+faststart", outputName);

    await ffmpeg.exec(args);
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const data = await ffmpeg.readFile(outputName);
    // ffmpeg.wasm returns Uint8Array | string; we always wrote a binary file.
    const view =
      data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    // Copy into a fresh ArrayBuffer-backed Uint8Array so the BlobPart type
    // doesn't pick up SharedArrayBuffer from ffmpeg.wasm's internal buffer.
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    return new Blob([buffer], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    // Best-effort cleanup of the virtual FS so memory doesn't pile up.
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

export type ExtractMode = "audio" | "video";

interface ExtractOptions {
  onPhase?: (phase: "loading" | "transcoding") => void;
  onProgress?: (ratio: number) => void;
  edit?: EditOptions;
}

/**
 * Pulls just the audio (mp3) or just the video (silent mp4) out of the
 * input file, applying the same trim/rotate/crop/zoom edit options as a
 * regular compress. Returns the result as a Blob — the caller is
 * responsible for triggering a download.
 */
export async function extract(
  mode: ExtractMode,
  file: File,
  options: ExtractOptions = {},
): Promise<Blob> {
  options.onPhase?.("loading");
  const ffmpeg = await getFFmpeg();
  const inputName = "input";
  const outputName = mode === "audio" ? "output.mp3" : "output.mp4";

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      options.onProgress?.(Math.max(0, Math.min(1, progress)));
    }
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    options.onPhase?.("transcoding");
    options.onProgress?.(0);

    const args: string[] = [];
    if (
      options.edit?.trimStart !== undefined &&
      options.edit.trimStart > 0
    ) {
      args.push("-ss", options.edit.trimStart.toFixed(3));
    }
    args.push("-i", inputName);
    if (
      options.edit?.trimEnd !== undefined &&
      options.edit.trimEnd > 0 &&
      (options.edit.trimStart === undefined ||
        options.edit.trimEnd > options.edit.trimStart)
    ) {
      const startOffset = options.edit?.trimStart ?? 0;
      args.push("-t", (options.edit.trimEnd - startOffset).toFixed(3));
    }

    if (mode === "audio") {
      // Audio only — drop video, encode as MP3 for broad compatibility.
      args.push(
        "-vn",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "4",
        "-movflags",
        "+faststart",
      );
      const audioTempo = options.edit?.playbackRate
        ? atempoChain(options.edit.playbackRate)
        : "";
      if (audioTempo) args.push("-af", audioTempo);
    } else {
      // Video only — drop audio, keep our usual H.264 480p preset.
      args.push(
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-vf",
        buildVideoFilters(options.edit),
        "-movflags",
        "+faststart",
      );
    }
    args.push(outputName);

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);
    const view =
      data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    return new Blob([buffer], {
      type: mode === "audio" ? "audio/mpeg" : "video/mp4",
    });
  } finally {
    ffmpeg.off("progress", progressHandler);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

interface GifOptions {
  onPhase?: (phase: "loading" | "transcoding") => void;
  onProgress?: (ratio: number) => void;
  edit?: EditOptions;
  // Render width in pixels. Smaller = much smaller file. Default 480 keeps
  // detail without bloating size.
  width?: number;
  // Output framerate. GIFs lock at fixed fps; lower = smaller file. 12 is a
  // reasonable balance.
  fps?: number;
}

/**
 * Re-encodes the input file into an animated GIF, applying any trim/rotate/
 * crop/zoom in the same pass. Uses ffmpeg's two-step palettegen/paletteuse
 * for noticeably better quality than the naive single-filter approach.
 */
export async function convertToGif(
  file: File,
  options: GifOptions = {},
): Promise<Blob> {
  options.onPhase?.("loading");
  const ffmpeg = await getFFmpeg();

  const inputName = "input";
  const outputName = "output.gif";
  const width = options.width ?? 480;
  const fps = options.fps ?? 12;

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      options.onProgress?.(Math.max(0, Math.min(1, progress)));
    }
  };
  ffmpeg.on("progress", progressHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    options.onPhase?.("transcoding");
    options.onProgress?.(0);

    // Compose a filter that applies crop -> rotate -> scale -> fps in one
    // pass, then runs palette generation in-line via filter_complex split.
    const editFilters: string[] = [];
    if (
      options.edit &&
      options.edit.sourceWidth &&
      options.edit.sourceHeight &&
      ((options.edit.cropAspect && options.edit.cropAspect !== "original") ||
        (options.edit.zoom && options.edit.zoom > 1))
    ) {
      const sw = options.edit.sourceWidth;
      const sh = options.edit.sourceHeight;
      let cw = sw;
      let ch = sh;
      if (options.edit.cropAspect && options.edit.cropAspect !== "original") {
        const [a, b] = options.edit.cropAspect.split(":").map(Number);
        const target = a / b;
        const source = sw / sh;
        if (source > target) {
          ch = sh;
          cw = Math.round(sh * target);
        } else {
          cw = sw;
          ch = Math.round(sw / target);
        }
      }
      if (options.edit.zoom && options.edit.zoom > 1) {
        cw = Math.round(cw / options.edit.zoom);
        ch = Math.round(ch / options.edit.zoom);
      }
      cw = Math.max(2, cw - (cw % 2));
      ch = Math.max(2, ch - (ch % 2));
      const x = Math.round((sw - cw) / 2);
      const y = Math.round((sh - ch) / 2);
      editFilters.push(`crop=${cw}:${ch}:${x}:${y}`);
    }
    if (options.edit?.rotation === 90) editFilters.push("transpose=1");
    else if (options.edit?.rotation === 180)
      editFilters.push("transpose=2,transpose=2");
    else if (options.edit?.rotation === 270) editFilters.push("transpose=2");

    if (
      options.edit?.playbackRate &&
      options.edit.playbackRate !== 1 &&
      options.edit.playbackRate > 0
    ) {
      editFilters.push(`setpts=${(1 / options.edit.playbackRate).toFixed(4)}*PTS`);
    }

    editFilters.push(`fps=${fps}`);
    editFilters.push(`scale=${width}:-1:flags=lanczos`);

    const filterComplex =
      `[0:v] ${editFilters.join(",")},split [a][b];` +
      `[a] palettegen=stats_mode=diff [p];` +
      `[b][p] paletteuse=dither=bayer:bayer_scale=5`;

    const args: string[] = [];
    if (options.edit?.trimStart && options.edit.trimStart > 0) {
      args.push("-ss", options.edit.trimStart.toFixed(3));
    }
    args.push("-i", inputName);
    if (
      options.edit?.trimEnd !== undefined &&
      options.edit.trimEnd > 0 &&
      (options.edit.trimStart === undefined ||
        options.edit.trimEnd > options.edit.trimStart)
    ) {
      const startOffset = options.edit?.trimStart ?? 0;
      args.push("-t", (options.edit.trimEnd - startOffset).toFixed(3));
    }
    args.push("-filter_complex", filterComplex, "-loop", "0", outputName);

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);
    const view =
      data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    const buffer = new ArrayBuffer(view.byteLength);
    new Uint8Array(buffer).set(view);
    return new Blob([buffer], { type: "image/gif" });
  } finally {
    ffmpeg.off("progress", progressHandler);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}
