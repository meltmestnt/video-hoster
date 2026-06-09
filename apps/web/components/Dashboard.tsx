"use client";

import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { VideoCard } from "./VideoCard";
import { GifCard } from "./GifCard";
import {
  InfiniteScrollSentinel,
  InfiniteScrollSpinner,
} from "./InfiniteScrollSentinel";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { VideoSort } from "@repo/shared";

type VideoListResult = inferRouterOutputs<AppRouter>["videos"]["list"];
type GifListResult = inferRouterOutputs<AppRouter>["gifs"]["list"];

const PAGE_LIMIT = 20;

export function Dashboard({
  initial,
  initialGifs,
  sort,
  initialPage = 1,
}: {
  initial: VideoListResult;
  initialGifs: GifListResult;
  sort: VideoSort;
  // SSR-time page so a /?page=N or /all?page=N deep link keeps showing
  // the right slice across refetches. Both lists offset to the same
  // page; the merged grid still interleaves by createdAt.
  initialPage?: number;
}) {
  const t = useT();
  const videoInput =
    initialPage > 1
      ? { limit: PAGE_LIMIT, sort, page: initialPage }
      : { limit: PAGE_LIMIT, sort };
  const gifInput =
    initialPage > 1
      ? { limit: PAGE_LIMIT, sort, page: initialPage }
      : { limit: PAGE_LIMIT, sort };
  const videosQuery = trpc.videos.list.useInfiniteQuery(videoInput, {
    initialData: { pages: [initial], pageParams: [undefined] },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10_000,
  });
  const gifsQuery = trpc.gifs.list.useInfiniteQuery(gifInput, {
    initialData: { pages: [initialGifs], pageParams: [undefined] },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10_000,
  });

  // Interleave videos and gifs by createdAt *per page*, then concatenate.
  // Merging across all pages at once causes the last few page-N items
  // to shift down when page N+1 lands: a freshly fetched video can
  // have a createdAt that sits between two already-rendered gifs, so
  // it slots into the middle of page N's tail and pushes those gifs
  // into what looks like the next batch. Per-page merge locks each
  // batch's order in place — once a page renders, its items stay put.
  // Across batch boundaries the merge isn't strictly createdAt-sorted,
  // but that's an acceptable trade since cursor pagination already
  // guarantees page N+1 only contains items older than page N's tail.
  type VideoItem = (typeof initial)["items"][number];
  type GifItem = (typeof initialGifs)["items"][number];
  type Item =
    | { kind: "video"; data: VideoItem; pageIdx: number }
    | { kind: "gif"; data: GifItem; pageIdx: number };

  const videoPages = videosQuery.data?.pages ?? [];
  const gifPages = gifsQuery.data?.pages ?? [];
  const pageCount = Math.max(videoPages.length, gifPages.length);
  const merged: Item[] = [];
  for (let p = 0; p < pageCount; p++) {
    const vp = videoPages[p]?.items ?? [];
    const gp = gifPages[p]?.items ?? [];
    let vi = 0;
    let gi = 0;
    while (vi < vp.length || gi < gp.length) {
      const v = vp[vi];
      const g = gp[gi];
      if (v && (!g || new Date(v.createdAt) >= new Date(g.createdAt))) {
        merged.push({ kind: "video", data: v, pageIdx: p });
        vi++;
      } else if (g) {
        merged.push({ kind: "gif", data: g, pageIdx: p });
        gi++;
      }
    }
  }

  if (merged.length === 0) {
    return (
      <Flex
        align="center"
        justify="center"
        style={{
          padding: "64px 24px",
          background: "var(--gray-2)",
          borderRadius: "var(--radius-3)",
          border: "1px dashed var(--gray-5)",
        }}
      >
        <Text color="gray">{t("page.dashboard.empty")}</Text>
      </Flex>
    );
  }

  // Either query having more pages means we should keep watching the
  // sentinel; we fetch whichever still has results so the merged grid
  // keeps growing.
  const hasMore = !!videosQuery.hasNextPage || !!gifsQuery.hasNextPage;
  const isFetching =
    videosQuery.isFetchingNextPage || gifsQuery.isFetchingNextPage;

  const loadMore = () => {
    if (videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
      videosQuery.fetchNextPage();
    }
    if (gifsQuery.hasNextPage && !gifsQuery.isFetchingNextPage) {
      gifsQuery.fetchNextPage();
    }
  };

  return (
    <>
      <div className="dashboard-grid">
        {merged.map((item, i) => {
          // Cascade only for the SSR'd / first-fetch batch. Infinite-loaded
          // items get instantEntry — no cascade, no staggered delay — so
          // the new batch pops in at its final state instead of trickling
          // in below the existing grid.
          const isInfinite = item.pageIdx > 0;
          const idx = isInfinite ? 0 : i % (PAGE_LIMIT * 2);
          return item.kind === "video" ? (
            <VideoCard
              key={`v-${item.data.id}`}
              video={item.data}
              index={idx}
              instantEntry={isInfinite}
            />
          ) : (
            <GifCard
              key={`g-${item.data.id}`}
              gif={item.data}
              index={idx}
              instantEntry={isInfinite}
            />
          );
        })}
      </div>
      {isFetching && <InfiniteScrollSpinner />}
      <InfiniteScrollSentinel
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={loadMore}
      />
    </>
  );
}
