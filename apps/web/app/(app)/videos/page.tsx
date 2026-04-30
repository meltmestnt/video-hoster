import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerTrpc } from "@/lib/trpc-server";
import { VideoCard } from "@/components/VideoCard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

export const metadata: Metadata = {
  title: "All videos",
  description:
    "Browse the latest public videos uploaded to Video Hoster. Sort by newest, most liked, or most disliked.",
  alternates: { canonical: absoluteUrl("/videos") },
  openGraph: {
    title: "All videos — Video Hoster",
    description: "Browse the latest public videos uploaded to Video Hoster.",
    url: absoluteUrl("/videos"),
    type: "website",
  },
};

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();
  const result = await trpc.videos.list.query({ limit: 24, sort });

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              All videos
            </Heading>
            <Text as="p" color="gray" size="2">
              Recent video uploads on Video Hoster.
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>

      {result.items.length === 0 ? (
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
      ) : (
        <div className="dashboard-grid">
          {result.items.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
