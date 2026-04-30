"use client";

import { Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { VideoCard } from "./VideoCard";
import { GifCard } from "./GifCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { VideoSort } from "@repo/shared";

type VideoListResult = inferRouterOutputs<AppRouter>["videos"]["list"];
type GifListResult = inferRouterOutputs<AppRouter>["gifs"]["list"];

export function Dashboard({
  initial,
  initialGifs,
  sort,
}: {
  initial: VideoListResult;
  initialGifs: GifListResult;
  sort: VideoSort;
}) {
  const { data: videosData } = trpc.videos.list.useQuery(
    { limit: 24, sort },
    { initialData: initial },
  );
  const { data: gifsData } = trpc.gifs.list.useQuery(
    { limit: 24, sort },
    { initialData: initialGifs },
  );

  const videos = videosData?.items ?? [];
  const gifs = gifsData?.items ?? [];

  // Interleave videos and gifs by createdAt so the freshest content of
  // either kind appears first. The chosen sort still applies inside each
  // list (the API ordered them); merging by createdAt for the "newest"
  // view feels most natural and is a reasonable approximation for the
  // count-based sorts since the per-list ordering is preserved.
  type Item =
    | { kind: "video"; data: (typeof videos)[number] }
    | { kind: "gif"; data: (typeof gifs)[number] };
  const merged: Item[] = [];
  let vi = 0;
  let gi = 0;
  while (vi < videos.length || gi < gifs.length) {
    const v = videos[vi];
    const g = gifs[gi];
    if (v && (!g || new Date(v.createdAt) >= new Date(g.createdAt))) {
      merged.push({ kind: "video", data: v });
      vi++;
    } else if (g) {
      merged.push({ kind: "gif", data: g });
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
        <Text color="gray">
          Nothing here yet. Click "Upload" to add the first video or GIF.
        </Text>
      </Flex>
    );
  }

  return (
    <div className="dashboard-grid">
      {merged.map((item, i) =>
        item.kind === "video" ? (
          <VideoCard key={`v-${item.data.id}`} video={item.data} index={i} />
        ) : (
          <GifCard key={`g-${item.data.id}`} gif={item.data} index={i} />
        ),
      )}
    </div>
  );
}
