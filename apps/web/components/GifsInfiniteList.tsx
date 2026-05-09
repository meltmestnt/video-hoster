"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { GifCard } from "./GifCard";
import {
  InfiniteScrollSentinel,
  InfiniteScrollSpinner,
} from "./InfiniteScrollSentinel";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { VideoSort } from "@repo/shared";

// Cap on how long we hold a fetched page hidden waiting for its images.
// Items below the fold won't fire onLoad until scrolled in (loading="lazy"),
// so the all-ready signal can never arrive for them — this timeout is the
// guarantee that the page reveals regardless.
const PAGE_REVEAL_TIMEOUT_MS = 1500;

type GifListResult = inferRouterOutputs<AppRouter>["gifs"]["list"];

interface Props {
  initial: GifListResult;
  sort: VideoSort;
  signedIn: boolean;
  limit?: number;
}

export function GifsInfiniteList({
  initial,
  sort,
  signedIn,
  limit = 20,
}: Props) {
  const t = useT();
  const query = trpc.gifs.list.useInfiniteQuery(
    { limit, sort },
    {
      initialData: { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 10_000,
    },
  );

  const pages = query.data?.pages ?? [];

  // Page 0 is the SSR'd / first-fetch page — reveal it immediately so the
  // first paint is never gated. Pages 1+ wait until all their items have
  // first-framed (or the timeout fires) so cards in a batch reveal together.
  const [revealedPages, setRevealedPages] = useState<Set<number>>(
    () => new Set([0]),
  );
  const readyCountsRef = useRef<Map<number, number>>(new Map());
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const revealPage = useCallback((idx: number) => {
    setRevealedPages((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }, []);

  // Reset batching state when the sort changes — useInfiniteQuery rebuilds
  // its pages from scratch under a new query key, so revealedPages tracking
  // for the old key is stale.
  useEffect(() => {
    setRevealedPages(new Set([0]));
    readyCountsRef.current.clear();
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current.clear();
  }, [sort]);

  // Schedule a fallback reveal timer for any page that doesn't already have
  // one. Timers are not restarted across renders, so a page's clock isn't
  // extended when sibling pages load.
  useEffect(() => {
    pages.forEach((_, idx) => {
      if (idx === 0) return;
      if (timersRef.current.has(idx)) return;
      const id = setTimeout(() => {
        timersRef.current.delete(idx);
        revealPage(idx);
      }, PAGE_REVEAL_TIMEOUT_MS);
      timersRef.current.set(idx, id);
    });
  }, [pages.length, revealPage]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  const handleItemReady = useCallback(
    (pageIdx: number, totalInPage: number) => {
      if (pageIdx === 0) return;
      const counts = readyCountsRef.current;
      const next = (counts.get(pageIdx) ?? 0) + 1;
      counts.set(pageIdx, next);
      if (next >= totalInPage) {
        const timer = timersRef.current.get(pageIdx);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(pageIdx);
        }
        revealPage(pageIdx);
      }
    },
    [revealPage],
  );

  const items = pages.flatMap((p, pageIdx) =>
    p.items.map((g) => ({ gif: g, pageIdx, pageSize: p.items.length })),
  );

  if (items.length === 0) {
    return (
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="3"
        style={{
          padding: "64px 24px",
          background: "var(--gray-2)",
          borderRadius: "var(--radius-3)",
          border: "1px dashed var(--gray-5)",
        }}
      >
        <Text color="gray">
          {signedIn ? t("page.gifs.empty") : t("page.gifs.empty.anon")}
        </Text>
        {!signedIn && (
          <Button asChild size="2">
            <Link href="/signup">{t("topbar.signUp")}</Link>
          </Button>
        )}
      </Flex>
    );
  }

  return (
    <>
      <div className="dashboard-grid">
        {items.map(({ gif, pageIdx, pageSize }, i) => (
          <GifCard
            key={gif.id}
            gif={gif}
            index={i % limit}
            revealMedia={revealedPages.has(pageIdx)}
            onMediaReady={() => handleItemReady(pageIdx, pageSize)}
          />
        ))}
      </div>
      {query.isFetchingNextPage && <InfiniteScrollSpinner />}
      <InfiniteScrollSentinel
        hasMore={!!query.hasNextPage}
        isFetching={query.isFetchingNextPage}
        onLoadMore={() => {
          query.fetchNextPage();
        }}
      />
    </>
  );
}
