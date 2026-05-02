"use client";

const MORPH_MS = 300;
const MORPH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * Probes the destination page's first .video-page column to figure out the
 * exact rectangle the morph overlay should land in. Builds a hidden replica
 * inside the live <Container> so we read the same width/position the real
 * .player-frame will get post-navigation, instead of approximating from the
 * source page's geometry.
 */
function computePlayerRect():
  | { top: number; left: number; width: number; height: number }
  | null {
  const inner = document.querySelector(
    ".rt-ContainerInner",
  ) as HTMLElement | null;
  if (!inner) return null;

  const probe = document.createElement("div");
  probe.className = "video-page";
  probe.style.cssText =
    "position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none";
  const col1 = document.createElement("div");
  col1.style.minHeight = "1px";
  const col2 = document.createElement("div");
  col2.style.minHeight = "1px";
  probe.appendChild(col1);
  probe.appendChild(col2);

  const innerComputed = getComputedStyle(inner);
  const wasStatic = innerComputed.position === "static";
  const previousPosition = inner.style.position;
  if (wasStatic) inner.style.position = "relative";

  inner.appendChild(probe);
  const innerRect = inner.getBoundingClientRect();
  const probeRect = probe.getBoundingClientRect();
  const col1Rect = col1.getBoundingClientRect();
  const leftOffset = col1Rect.left - probeRect.left;
  inner.removeChild(probe);

  if (wasStatic) inner.style.position = previousPosition;

  const playerWidth = col1Rect.width;
  const playerHeight = (playerWidth * 9) / 16;
  const playerTop = innerRect.top;
  const playerLeft = innerRect.left + leftOffset;
  return {
    top: playerTop,
    left: playerLeft,
    width: playerWidth,
    height: playerHeight,
  };
}

interface MorphArgs {
  /** The element being morphed away from (its rect is the start position). */
  thumbEl: HTMLElement;
  /** Optional URL to paint inside the morphing overlay. */
  imageUrl: string | null;
  /** CSS background while the overlay morphs (visible if no image / image-edges). */
  backgroundColor: string;
  /** "cover" matches the card thumb; "contain" matches the destination player. */
  objectFit?: "cover" | "contain";
  /** Called after the overlay is parented and styled — used to push the route. */
  onMorphStart: () => void;
}

/**
 * Animates a card thumbnail outwards into the destination .player-frame.
 * Returns a cleanup that's invoked once both the morph animation has
 * settled AND the destination page has signaled it has mounted (via the
 * "videoplayer:morph:landed" event from <MorphLandingSignal />).
 *
 * The same morph used for VideoCard works for GifCard with no changes —
 * both destinations render a 16:9 .player-frame as the first child of
 * .video-page's primary column, so computePlayerRect lands on the right
 * rectangle for both.
 */
export function morphToPlayer(args: MorphArgs): boolean {
  const dest = computePlayerRect();
  if (!dest) return false;

  const src = args.thumbEl.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:absolute",
    `top:${src.top + scrollY}px`,
    `left:${src.left + scrollX}px`,
    `width:${src.width}px`,
    `height:${src.height}px`,
    "z-index:9999",
    "border-radius:50%",
    "overflow:hidden",
    `background:${args.backgroundColor}`,
    "transform-origin:center center",
    "pointer-events:none",
    "will-change:transform,border-radius",
    `transition:transform ${MORPH_MS}ms ${MORPH_EASING},border-radius ${MORPH_MS}ms ${MORPH_EASING}`,
  ].join(";");

  if (args.imageUrl) {
    const img = document.createElement("img");
    img.src = args.imageUrl;
    const fit = args.objectFit ?? "cover";
    img.style.cssText = `width:100%;height:100%;object-fit:${fit};display:block`;
    overlay.appendChild(img);
  }

  document.body.appendChild(overlay);
  document.body.dataset.morphing = "1";
  args.thumbEl.style.opacity = "0";

  // Force a reflow so the initial styles commit before transitioning.
  void overlay.offsetWidth;

  const srcCenterX = src.left + src.width / 2;
  const srcCenterY = src.top + src.height / 2;
  const destCenterX = dest.left + dest.width / 2;
  const destCenterY = dest.top + dest.height / 2;
  const tx = destCenterX - srcCenterX;
  const ty = destCenterY - srcCenterY;
  const sx = dest.width / src.width;
  const sy = dest.height / src.height;
  overlay.style.transform = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
  overlay.style.borderRadius = "var(--radius-3)";

  args.onMorphStart();

  // Hold the overlay in place until BOTH the animation has finished and
  // the destination page has actually rendered. The destination page
  // mounts <MorphLandingSignal /> which fires "videoplayer:morph:landed";
  // a 6s safety net cleans up if the destination never arrives.
  const SAFETY_MS = 6000;
  let morphDone = false;
  let destLanded = false;
  let cleaned = false;

  // Forced cleanup detaches every listener and removes the overlay
  // immediately — used when the user navigates Back / restores from
  // bfcache before the normal "morph + landed" handshake settles. Without
  // this the overlay sticks around on top of the original page after
  // popstate.
  const detachAll = () => {
    window.removeEventListener("videoplayer:morph:landed", onLanded);
    window.removeEventListener("popstate", forceCleanup);
    window.removeEventListener("pageshow", forceCleanup);
    window.removeEventListener("hashchange", forceCleanup);
    document.removeEventListener("visibilitychange", onVisibility);
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    detachAll();
    overlay.style.transition = "opacity 120ms ease";
    overlay.style.opacity = "0";
    window.setTimeout(() => {
      overlay.remove();
      delete document.body.dataset.morphing;
    }, 140);
  };

  const forceCleanup = () => {
    if (cleaned) return;
    cleaned = true;
    detachAll();
    overlay.remove();
    delete document.body.dataset.morphing;
  };

  const tryCleanup = () => {
    if (morphDone && destLanded) cleanup();
  };

  const onLanded = () => {
    destLanded = true;
    tryCleanup();
  };
  window.addEventListener("videoplayer:morph:landed", onLanded, { once: true });

  // Browser navigation (Back/Forward, bfcache restore, hash changes) means
  // the destination's MorphLandingSignal will never arrive — and even if
  // it does, we're no longer on the page that initiated the morph. Cut
  // the overlay loose immediately on any of those signals so the user
  // never sees it covering the list view they navigated back to.
  window.addEventListener("popstate", forceCleanup);
  window.addEventListener("pageshow", forceCleanup);
  window.addEventListener("hashchange", forceCleanup);

  // Some browsers (mobile Safari especially) fire pagehide+visibilitychange
  // on tab switch without popstate; if the user backgrounds the tab and
  // returns, treat it as "definitely past the morph window" and clean up.
  const onVisibility = () => {
    if (document.visibilityState === "visible") forceCleanup();
  };
  document.addEventListener("visibilitychange", onVisibility);

  window.setTimeout(() => {
    morphDone = true;
    tryCleanup();
  }, MORPH_MS + 60);

  window.setTimeout(() => {
    destLanded = true;
    morphDone = true;
    tryCleanup();
  }, SAFETY_MS);

  return true;
}
