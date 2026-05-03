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
 *   2. **iOS won't paint a frame to canvas without a play() call.**
 *      drawImage on a video that has only been seeked produces a black
 *      canvas. We seek + play in one step (set currentTime, then call
 *      play) and pause as soon as the first real frame is composited.
 *      A separate "prime then seek" two-step doesn't work because iOS
 *      drops seeked/timeupdate when the video is paused, so the seek
 *      phase would deadlock.
 *   3. **Frame-painted signal is unreliable.** We race
 *      `requestVideoFrameCallback` against `seeked` and `timeupdate`
 *      so a single missed event from any one of them doesn't stall.
 *   4. **Hangs need a deadline.** The seek+play has an explicit
 *      timeout — a corrupt or unsupported file rejects with a clear
 *      error instead of leaving the dialog spinning indefinitely.
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

// Wait until the next painted frame after `kick` runs. Races every
// available signal — `requestVideoFrameCallback` (fires *after* a frame
// has been composited, when supported) plus `seeked` and `timeupdate`
// — so a single missed event from any one of them doesn't stall the
// caller. iOS Safari is particularly inconsistent: rVFC is supported
// from 15.4 but doesn't always fire after a seek when the video is
// paused; `seeked` sometimes drops the first event after a play→pause
// prime; `timeupdate` is the most reliable fallback once playback (or
// seek) lands a new frame. Whichever fires first wins.
function awaitNextFrame(video: HTMLVideoElement, kick: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      video.removeEventListener("seeked", finish);
      video.removeEventListener("timeupdate", finish);
      video.removeEventListener("error", onError);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // One extra rAF after the signal: belt+braces for iOS, where the
      // GPU composite occasionally lags one frame behind the JS event.
      requestAnimationFrame(() => resolve());
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Video element errored while waiting for frame"));
    };
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("timeupdate", finish, { once: true });
    const rvfc = (video as RVFCVideo).requestVideoFrameCallback;
    if (typeof rvfc === "function") {
      rvfc.call(video, finish);
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

    const target = Math.min(
      Math.max(0, atSeconds),
      Math.max(0, (video.duration || 0) - 0.05),
    );

    // Single-phase seek + play. iOS Safari has two compounding issues
    // we need to defeat at the same time:
    //   - drawImage returns a black canvas until play() has been called
    //     at least once on this video element.
    //   - When the video is paused, setting currentTime often does NOT
    //     fire seeked/timeupdate/rVFC, so a separate "prime then seek"
    //     two-step would deadlock at the seek phase.
    // Combining them — set currentTime first, then play — makes iOS
    // resume from the seek point and paint a real frame, which fires
    // every signal awaitNextFrame is racing on. We pause immediately
    // after the first frame paint, so total visible playback is one
    // composited frame.
    video.currentTime = target;
    await timeoutReject(
      awaitNextFrame(video, () => {
        const p = video.play();
        if (p && typeof p.then === "function") {
          // muted + playsInline normally lifts the gesture requirement,
          // but a few Android WebViews still reject. Swallow so the
          // event-listener fallback in awaitNextFrame can still resolve.
          p.catch(() => {});
        }
      }),
      SEEK_TIMEOUT_MS + PLAY_PRIME_TIMEOUT_MS,
      "Timed out seeking the video. Pick a custom thumbnail manually.",
    );
    video.pause();

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
