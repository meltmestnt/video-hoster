"use client";

import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { VideoCard } from "./VideoCard";
import {
  InfiniteScrollSentinel,
  InfiniteScrollSpinner,
} from "./InfiniteScrollSentinel";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { VideoSort } from "@repo/shared";

type VideoListResult = inferRouterOutputs<AppRouter>["videos"]["list"];

interface Props {
  initial: VideoListResult;
  sort: VideoSort;
  limit?: number;
}

export function VideosInfiniteList({ initial, sort, limit = 20 }: Props) {
  const t = useT();
  const query = trpc.videos.list.useInfiniteQuery(
    { limit, sort },
    {
      initialData: { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 10_000,
    },
  );

  const items =
    query.data?.pages.flatMap((p, pageIdx) =>
      p.items.map((v) => ({ video: v, pageIdx })),
    ) ?? [];

  if (items.length === 0) {
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
        <Text color="gray">
          {t("page.videos.empty")}
        </Text>
      </Flex>
    );
  }

  return (
    <>
      <div className="dashboard-grid">
        {items.map(({ video, pageIdx }, i) => (
          // Cascade only for the SSR'd / first-fetch page. Infinite-scrolled
          // pages get instantEntry — no cascade — so each new batch appears
          // at its final state instead of re-staggering as the user scrolls.
          <VideoCard
            key={video.id}
            video={video}
            index={pageIdx === 0 ? i % limit : 0}
            instantEntry={pageIdx > 0}
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
