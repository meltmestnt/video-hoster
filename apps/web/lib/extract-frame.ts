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
 *   1. **Element must be in the DOM, on-screen.** iOS Safari silently
 *      skips decoding for elements positioned far outside the viewport
 *      (e.g. `left: -99999px`). We pin a 1×1 transparent element at the
 *      top-left of the viewport so iOS keeps it in the render tree.
 *   2. **iOS won't paint a frame until the video has been played once.**
 *      drawImage on a video that has only been seeked produces a black
 *      canvas. We `play()` then immediately `pause()` to wake the
 *      decoder before seeking.
 *   3. **`seeked` is unreliable on iOS.** We wait for whichever fires
 *      first of `requestVideoFrameCallback` (frame-painted, when
 *      supported), `seeked`, or `timeupdate` so the slow path resolves.
 *   4. **Hangs need a deadline.** Each phase has an explicit timeout —
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
const PLAY_PRIME_TIMEOUT_MS = 4_000;
const SEEK_TIMEOUT_MS = 8_000;

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

// Wait until the next painted frame after `kick` runs. Prefers the
// browser's `requestVideoFrameCallback` (fires *after* a frame has been
// composited) and falls back to seeked/timeupdate + a rAF tick when the
// API isn't available — iOS Safari < 15.4, Firefox.
function awaitNextFrame(video: HTMLVideoElement, kick: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // One extra rAF after rVFC: belt+braces for iOS, where the GPU
      // composite occasionally lags one frame behind the JS callback.
      requestAnimationFrame(() => resolve());
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Video element errored while waiting for frame"));
    };
    video.addEventListener("error", onError, { once: true });

    const rvfc = (video as RVFCVideo).requestVideoFrameCallback;
    if (typeof rvfc === "function") {
      rvfc.call(video, finish);
    } else {
      video.addEventListener("seeked", finish, { once: true });
      video.addEventListener("timeupdate", finish, { once: true });
    }
    kick();
  });
}

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
  //
  // Pin to the viewport's top-left rather than `-99999px`: iOS Safari
  // skips rendering elements that are entirely outside the viewport, and
  // a non-rendered video produces a black drawImage. 1×1 + opacity 0 +
  // pointer-events none keeps it imperceptible while still in-frame.
  video.style.position = "fixed";
  video.style.left = "0";
  video.style.top = "0";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.zIndex = "-1";
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

    // Prime the decoder. iOS Safari refuses to paint the very first
    // frame to a canvas if the element has only been seeked — drawImage
    // returns a black rect until play() has been called at least once.
    // muted + playsInline lifts the autoplay-gesture restriction, so
    // this works without a user-visible play. We swallow play() errors
    // (some Android WebViews reject without gesture even when muted)
    // because the seek path below is still worth attempting.
    try {
      await timeoutReject(
        awaitNextFrame(video, () => {
          const p = video.play();
          if (p && typeof p.then === "function") {
            p.catch(() => {});
          }
        }),
        PLAY_PRIME_TIMEOUT_MS,
        "Timed out priming the video decoder. Pick a custom thumbnail manually.",
      );
    } catch {
      // Non-fatal — try the seek anyway. The fallback path (seeked +
      // timeupdate) handles browsers that didn't need priming.
    } finally {
      video.pause();
    }

    const target = Math.min(
      Math.max(0, atSeconds),
      Math.max(0, (video.duration || 0) - 0.05),
    );

    await timeoutReject(
      awaitNextFrame(video, () => {
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
