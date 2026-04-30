"use client";

import Link from "next/link";
import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "./VideoCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type FavoritesResult = inferRouterOutputs<AppRouter>["videos"]["favorites"];

export function FavoritesList({ initial }: { initial: FavoritesResult }) {
  const { data } = trpc.videos.favorites.useQuery(
    { limit: 24 },
    { initialData: initial },
  );

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <Flex
        align="center"
        justify="center"
        direction="column"
        gap="2"
        style={{
          padding: "64px 24px",
          background: "var(--gray-2)",
          borderRadius: "var(--radius-3)",
          border: "1px dashed var(--gray-5)",
        }}
      >
        <Text color="gray">No favorites yet.</Text>
        <Text size="2" color="gray">
          Open a video and tap the star to save it here.
        </Text>
        <Link href="/" style={{ color: "var(--accent-9)" }}>
          Browse videos →
        </Link>
      </Flex>
    );
  }

  return (
    <div className="dashboard-grid">
      {items.map((v, i) => (
        <VideoCard key={v.id} video={v} index={i} />
      ))}
    </div>
  );
}
