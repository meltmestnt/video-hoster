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
}: {
  initial: VideoListResult;
  initialGifs: GifListResult;
  sort: VideoSort;
}) {
  const t = useT();
  const videosQuery = trpc.videos.list.useInfiniteQuery(
    { limit: PAGE_LIMIT, sort },
    {
      initialData: { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 10_000,
    },
  );
  const gifsQuery = trpc.gifs.list.useInfiniteQuery(
    { limit: PAGE_LIMIT, sort },
    {
      initialData: { pages: [initialGifs], pageParams: [undefined] },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 10_000,
    },
  );

  // Carry pageIdx alongside each item so the merged grid can tell
  // SSR'd / first-fetch items apart from infinite-loaded ones. The two
  // streams interleave by createdAt, so a page-1 video can land between
  // page-0 gifs — a position-based "first N are initial" rule wouldn't
  // be reliable.
  const videos =
    videosQuery.data?.pages.flatMap((p, pageIdx) =>
      p.items.map((v) => ({ item: v, pageIdx })),
    ) ?? [];
  const gifs =
    gifsQuery.data?.pages.flatMap((p, pageIdx) =>
      p.items.map((g) => ({ item: g, pageIdx })),
    ) ?? [];

  // Interleave videos and gifs by createdAt so the freshest content of
  // either kind appears first. The chosen sort still applies inside each
  // list (the API ordered them); merging by createdAt for the "newest"
  // view feels most natural and is a reasonable approximation for the
  // count-based sorts since the per-list ordering is preserved.
  type VideoData = (typeof videos)[number]["item"];
  type GifData = (typeof gifs)[number]["item"];
  type Item =
    | { kind: "video"; data: VideoData; pageIdx: number }
    | { kind: "gif"; data: GifData; pageIdx: number };
  const merged: Item[] = [];
  let vi = 0;
  let gi = 0;
  while (vi < videos.length || gi < gifs.length) {
    const v = videos[vi];
    const g = gifs[gi];
    if (
      v &&
      (!g || new Date(v.item.createdAt) >= new Date(g.item.createdAt))
    ) {
      merged.push({ kind: "video", data: v.item, pageIdx: v.pageIdx });
      vi++;
    } else if (g) {
      merged.push({ kind: "gif", data: g.item, pageIdx: g.pageIdx });
      gi++;
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
