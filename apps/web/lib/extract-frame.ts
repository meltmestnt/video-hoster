"use client";

/**
 * Capture a single frame from a video file at a given timestamp and return it
 * as a JPEG Blob. Uses an off-DOM <video> + <canvas>; no ffmpeg.wasm needed.
 *
 * Caller passes either the original File (we'll create + revoke an object URL)
 * or an existing object URL when one is already available — the second form
 * avoids re-decoding the file twice in the upload flow.
 */
interface ExtractFrameOptions {
  // Target seconds. Clamped to the video's actual duration.
  atSeconds?: number;
  // Max output width in px. Aspect ratio preserved. Default 640.
  maxWidth?: number;
  // JPEG quality 0..1. Default 0.82.
  quality?: number;
}

export async function extractFrame(
  source: File | string,
  options: ExtractFrameOptions = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const { atSeconds = 1, maxWidth = 640, quality = 0.82 } = options;

  const ownsUrl = typeof source !== "string";
  const url = ownsUrl ? URL.createObjectURL(source) : source;

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = () =>
        reject(new Error("Failed to load video for thumbnail capture"));
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", onError, { once: true });
    });

    const target = Math.min(
      Math.max(0, atSeconds),
      Math.max(0, (video.duration || 0) - 0.05),
    );

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => resolve();
      const onError = () =>
        reject(new Error("Failed to seek video for thumbnail capture"));
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = target;
    });

    const sw = video.videoWidth;
    const sh = video.videoHeight;
    if (!sw || !sh) {
      throw new Error("Video has no dimensions; cannot capture thumbnail");
    }

    const scale = Math.min(1, maxWidth / sw);
    const dw = Math.max(2, Math.round(sw * scale));
    const dh = Math.max(2, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(video, 0, 0, dw, dh);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
        "image/jpeg",
        quality,
      );
    });

    return { blob, width: dw, height: dh };
  } finally {
    video.removeAttribute("src");
    video.load();
    if (ownsUrl) URL.revokeObjectURL(url);
  }
}
