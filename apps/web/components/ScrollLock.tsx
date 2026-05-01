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

    // Save the original style values so we can restore them on unlock —
    // important so we don't blow away anything else that was setting them.
    const original = {
      htmlOverflow: "",
      bodyOverflow: "",
      bodyPosition: "",
      bodyTop: "",
      bodyWidth: "",
      bodyOverscroll: "",
    };

    const lock = () => {
      savedScrollY = window.scrollY;
      document.body.dataset.scrollLocked = "1";

      // Snapshot pre-lock styles.
      original.htmlOverflow = document.documentElement.style.overflow;
      original.bodyOverflow = document.body.style.overflow;
      original.bodyPosition = document.body.style.position;
      original.bodyTop = document.body.style.top;
      original.bodyWidth = document.body.style.width;
      original.bodyOverscroll = document.body.style.overscrollBehavior;

      // Apply via inline styles too — that beats any wrapper element's
      // own overflow rules on specificity, which the CSS-only version
      // can lose to (e.g. Radix Theme's root, body's parent containers).
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overscrollBehavior = "contain";
    };

    const unlock = () => {
      delete document.body.dataset.scrollLocked;
      document.documentElement.style.overflow = original.htmlOverflow;
      document.body.style.overflow = original.bodyOverflow;
      document.body.style.position = original.bodyPosition;
      document.body.style.top = original.bodyTop;
      document.body.style.width = original.bodyWidth;
      document.body.style.overscrollBehavior = original.bodyOverscroll;
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
