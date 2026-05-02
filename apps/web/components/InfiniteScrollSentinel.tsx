"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Whether more pages are available (false = stop observing). */
  hasMore: boolean;
  /** Whether a fetch is currently in-flight (don't fire while busy). */
  isFetching: boolean;
  /** Trigger the next-page fetch. */
  onLoadMore: () => void;
  /**
   * Distance from the bottom (in px) at which the next page starts loading.
   * Default 600 — kicks in roughly one screenful before the bottom so the
   * user rarely sees the spinner unless their scroll is faster than the
   * fetch.
   */
  rootMargin?: number;
}

/**
 * IntersectionObserver-driven sentinel. Drop it at the bottom of an
 * infinite-scroll grid; when it crosses into the (extended) viewport, it
 * calls onLoadMore. Re-arms automatically once the next page renders and
 * the sentinel scrolls back out and back in again.
 */
export function InfiniteScrollSentinel({
  hasMore,
  isFetching,
  onLoadMore,
  rootMargin = 600,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Stash the latest callback + isFetching in refs so the observer
  // doesn't need to be re-created on every render. Critically:
  // listing `isFetching` as an effect dep used to tear down and rebuild
  // the observer every time a fetch completed, and a fresh
  // IntersectionObserver immediately reports the current intersection
  // state on its first tick — so if the sentinel was still in view
  // (which it usually is right after a page lands), it fired
  // onLoadMore again, looping until hasMore went false. Net effect:
  // a single mount loaded every page in one go.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const isFetchingRef = useRef(isFetching);
  isFetchingRef.current = isFetching;

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !isFetchingRef.current) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: `${rootMargin}px` },
    );
    observer.observe(node);

    // Belt-and-braces for "reload while scrolled to the bottom":
    // the page renders with only the first server-rendered page of
    // items, the browser restores scroll to the bottom of that
    // (short) document, and the sentinel is already in view at mount.
    // IntersectionObserver is supposed to deliver an initial reading
    // on the next frame, but the timing across hydration + scroll
    // restoration is fragile in Chrome — sometimes the observer
    // latches "not intersecting" before scroll settles and then
    // never fires until the user scrolls (which they can't, they're
    // already at the bottom). One synchronous bounding-rect check
    // covers that case without changing the observer-driven path.
    const rect = node.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const inViewWithMargin =
      rect.top - rootMargin < viewportH && rect.bottom + rootMargin > 0;
    if (inViewWithMargin && !isFetchingRef.current) {
      onLoadMoreRef.current();
    }

    return () => observer.disconnect();
  }, [hasMore, rootMargin]);

  return <div ref={ref} className="infinite-sentinel" aria-hidden />;
}

export function InfiniteScrollSpinner() {
  return <div className="infinite-spinner" role="status" aria-live="polite" />;
}
