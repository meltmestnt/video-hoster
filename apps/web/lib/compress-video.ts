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

export interface CompressOptions {
  // Called repeatedly during loading (0..1) and again during the actual
  // transcode (0..1). The phase tells the caller which one.
  onPhase?: (phase: "loading" | "transcoding") => void;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
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
    await ffmpeg.exec([
      "-i",
      inputName,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-vf",
      "scale=-2:480,fps=30",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputName,
    ]);
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
