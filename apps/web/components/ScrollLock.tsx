"use client";

import { useEffect } from "react";

const DIALOG_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * Locks page scroll while any Radix Dialog/AlertDialog is open and restores
 * the scroll position when they all close.
 *
 * Why this exists: globals.css applies overflow:hidden via :has(), but on
 * mobile that alone doesn't stop iOS rubber-band — we need position:fixed
 * on body. position:fixed however collapses the body to top:0, which
 * visually scrolls the page to the top while the dialog is open and snaps
 * back on close. To prevent that, we record window.scrollY on first open
 * and shift the fixed body up by that amount via an inline `top: -<y>px`
 * so the page appears unmoved. On final close we clear the inline top and
 * scrollTo() the saved position.
 */
export function ScrollLock() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let savedScrollY = 0;
    let openCount = 0;

    const lock = () => {
      savedScrollY = window.scrollY;
      document.body.dataset.scrollLocked = "1";
      // The CSS sets position:fixed on mobile; the inline top compensates
      // for it so the visible content doesn't jump to the top of the page.
      document.body.style.top = `-${savedScrollY}px`;
    };

    const unlock = () => {
      delete document.body.dataset.scrollLocked;
      document.body.style.top = "";
      // Restore scroll synchronously so the user sees no flicker.
      window.scrollTo(0, savedScrollY);
    };

    const recount = () => {
      const next = document.querySelectorAll(DIALOG_SELECTOR).length;
      if (next > 0 && openCount === 0) lock();
      else if (next === 0 && openCount > 0) unlock();
      openCount = next;
    };

    const observer = new MutationObserver(recount);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });
    // Run once in case a dialog is already open when this mounts (rare,
    // but possible during HMR).
    recount();

    return () => {
      observer.disconnect();
      if (openCount > 0) unlock();
    };
  }, []);

  return null;
}
