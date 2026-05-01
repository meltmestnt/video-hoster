"use client";

import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { ScreenshotCard } from "./ScreenshotCard";
import {
  InfiniteScrollSentinel,
  InfiniteScrollSpinner,
} from "./InfiniteScrollSentinel";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type ScreenshotListResult = inferRouterOutputs<AppRouter>["screenshots"]["list"];

interface Props {
  initial: ScreenshotListResult;
  limit?: number;
}

export function ScreenshotsInfiniteList({ initial, limit = 20 }: Props) {
  const t = useT();
  const query = trpc.screenshots.list.useInfiniteQuery(
    { limit },
    {
      initialData: { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: 10_000,
    },
  );

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

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
        <Text color="gray">{t("screenshots.empty")}</Text>
      </Flex>
    );
  }

  return (
    <>
      <div className="dashboard-grid">
        {items.map((s, i) => (
          <ScreenshotCard key={s.id} shot={s} index={i % limit} />
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
