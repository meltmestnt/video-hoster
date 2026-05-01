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
  // Stash the latest callback in a ref so the observer doesn't need to be
  // re-created every render just because the closure identity changed.
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !isFetching) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: `${rootMargin}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isFetching, rootMargin]);

  return <div ref={ref} className="infinite-sentinel" aria-hidden />;
}

export function InfiniteScrollSpinner() {
  return <div className="infinite-spinner" role="status" aria-live="polite" />;
}
