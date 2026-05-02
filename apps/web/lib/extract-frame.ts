"use client";

/**
 * Capture a single frame from a video file at a given timestamp and return it
 * as a JPEG Blob. Uses an in-DOM hidden <video> + <canvas>; no ffmpeg.wasm.
 *
 * Caller passes either the original File (we'll create + revoke an object URL)
 * or an existing object URL when one is already available — the second form
 * avoids re-decoding the file twice in the upload flow.
 *
 * Mobile-specific gotchas this implementation handles:
 *   1. **Element must be in the DOM.** iOS Safari (and some Android
 *      WebViews) silently refuse to decode an off-DOM <video>:
 *      loadedmetadata may never fire, currentTime sets get ignored, and
 *      the seeked event never lands — leaving the caller stuck on
 *      "creating…" forever. We append the element off-screen so it can
 *      decode while staying invisible.
 *   2. **`seeked` is unreliable on iOS for the first seek.** We wait for
 *      whichever fires first of `seeked` / `timeupdate` (timeupdate
 *      always fires once the new frame is rendered, regardless of
 *      whether `seeked` did) so the slow path also resolves.
 *   3. **Hangs need a deadline.** Each phase has an explicit timeout —
 *      a corrupt or unsupported file rejects with a clear error
 *      instead of leaving the dialog spinning indefinitely.
 */
interface ExtractFrameOptions {
  // Target seconds. Clamped to the video's actual duration.
  atSeconds?: number;
  // Max output width in px. Aspect ratio preserved. Default 640.
  maxWidth?: number;
  // JPEG quality 0..1. Default 0.82.
  quality?: number;
}

const METADATA_TIMEOUT_MS = 12_000;
const SEEK_TIMEOUT_MS = 8_000;

function timeoutReject<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
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
  // iOS in particular won't autoplay/decode without playsInline + muted.
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  // Object URLs are same-origin so crossOrigin isn't needed; setting it
  // can actually break decoding on some Android stock browsers when the
  // source is an object URL. Skip it.
  video.style.position = "fixed";
  video.style.left = "-99999px";
  video.style.top = "-99999px";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.setAttribute("aria-hidden", "true");

  // Append BEFORE setting src — iOS will sometimes start decoding only
  // when the element is already mounted.
  document.body.appendChild(video);
  video.src = url;
  video.load();

  try {
    await timeoutReject(
      new Promise<void>((resolve, reject) => {
        const onMeta = () => resolve();
        const onError = () =>
          reject(new Error("Failed to load video for thumbnail capture"));
        video.addEventListener("loadedmetadata", onMeta, { once: true });
        video.addEventListener("error", onError, { once: true });
        // Some Android WebViews fire `loadeddata` without `loadedmetadata`
        // when the buffer is fully decoded ahead of time; treat that as
        // good-enough since duration/dimensions are populated by then.
        video.addEventListener(
          "loadeddata",
          () => {
            if (video.readyState >= 1) resolve();
          },
          { once: true },
        );
      }),
      METADATA_TIMEOUT_MS,
      "Timed out loading video metadata. Try a smaller file or a different browser.",
    );

    const target = Math.min(
      Math.max(0, atSeconds),
      Math.max(0, (video.duration || 0) - 0.05),
    );

    await timeoutReject(
      new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const onError = () => {
          if (settled) return;
          settled = true;
          reject(new Error("Failed to seek video for thumbnail capture"));
        };
        // `seeked` is the canonical signal but iOS sometimes drops the
        // first one. `timeupdate` always fires once the player paints
        // the new frame — whichever wins, we have a frame to draw.
        video.addEventListener("seeked", finish, { once: true });
        video.addEventListener("timeupdate", finish, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = target;
      }),
      SEEK_TIMEOUT_MS,
      "Timed out seeking the video. Pick a custom thumbnail manually.",
    );

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
    video.remove();
    if (ownsUrl) URL.revokeObjectURL(url);
  }
}
