"use client";

import { useEffect } from "react";

// Fires once on mount so the source-page morph overlay (in VideoCard) knows
// the destination page has actually rendered and can fade itself out. This
// avoids a flash of the previous page when the destination's RSC stream
// takes longer than the morph animation.
//
// Also forces scroll to (0, 0) on every mount of a /gifs/[id] or
// /videos/[id] page. Next.js's default scroll-on-navigation runs, but it
// can lag behind the morph's settle/landed handshake — and bfcache /
// scroll-restoration paths sometimes leave the detail page parked at the
// list page's old scroll position. Jumping instantly here makes "select a
// gif/video → land at the top" deterministic regardless of how the
// navigation arrived.
export function MorphLandingSignal() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("videoplayer:morph:landed"));
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  return null;
}
