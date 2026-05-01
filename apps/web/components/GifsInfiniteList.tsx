"use client";

import Link from "next/link";
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

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

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
        {items.map((g, i) => (
          <GifCard key={g.id} gif={g} index={i % limit} />
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
