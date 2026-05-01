"use client";

import Link from "next/link";
import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { VideoCard } from "./VideoCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type FavoritesResult = inferRouterOutputs<AppRouter>["videos"]["favorites"];

export function FavoritesList({ initial }: { initial: FavoritesResult }) {
  const t = useT();
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
        <Text color="gray">{t("favorites.empty")}</Text>
        <Text size="2" color="gray">
          {t("favorites.empty.hint")}
        </Text>
        <Link href="/" style={{ color: "var(--accent-9)" }}>
          {t("favorites.empty.cta")}
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
