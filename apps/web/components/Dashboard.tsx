"use client";

import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "./VideoCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { VideoSort } from "@repo/shared";

type ListResult = inferRouterOutputs<AppRouter>["videos"]["list"];

export function Dashboard({
  initial,
  sort,
}: {
  initial: ListResult;
  sort: VideoSort;
}) {
  const { data } = trpc.videos.list.useQuery(
    { limit: 24, sort },
    { initialData: initial },
  );

  const items = data?.items ?? [];

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
          No videos yet. Click "Upload" to add the first one.
        </Text>
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
