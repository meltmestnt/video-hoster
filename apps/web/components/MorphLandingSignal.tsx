"use client";

import { useEffect } from "react";

// Fires once on mount so the source-page morph overlay (in VideoCard) knows
// the destination page has actually rendered and can fade itself out. This
// avoids a flash of the previous page when the destination's RSC stream
// takes longer than the morph animation.
export function MorphLandingSignal() {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("videoplayer:morph:landed"));
  }, []);
  return null;
}
