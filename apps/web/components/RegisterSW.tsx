"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on mount so the browser treats vids&gifs as an
 * installable PWA. The service worker file itself lives in /public/sw.js
 * and currently handles Web Push events; the same registration also
 * satisfies the install-criteria check Chrome/Edge run before showing
 * "Install app". Re-registering an already-registered worker is a no-op,
 * so this component is safe to mount alongside any future push-prompt
 * code that also calls register().
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Defer to next tick so SW registration doesn't compete with the
    // page's own resource fetches during the initial load.
    const t = window.setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Registration failures are non-fatal — installability and
          // pushes silently won't work, but the rest of the app does.
        });
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
