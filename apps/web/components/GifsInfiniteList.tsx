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

  const items =
    query.data?.pages.flatMap((p, pageIdx) =>
      p.items.map((g) => ({ gif: g, pageIdx })),
    ) ?? [];

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
        {items.map(({ gif, pageIdx }, i) => (
          <GifCard
            key={gif.id}
            gif={gif}
            // Cascade only for the SSR'd / first-fetch page so the entry
            // animation reads as intentional. Infinite-scrolled pages
            // get instantEntry — no cascade and no per-image fade — so
            // each card pops in the moment its first frame decodes.
            // With loading="lazy" off in GifCard, all images in a new
            // page fetch in parallel and finish within a few hundred
            // ms of each other; no synthesized batch wait needed.
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
