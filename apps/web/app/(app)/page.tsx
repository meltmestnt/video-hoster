import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerTrpc } from "@/lib/trpc-server";
import { Dashboard } from "@/components/Dashboard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All videos",
  description:
    "Browse the latest public videos uploaded to Denis's videos. Sort by newest, most liked, or most disliked.",
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: "All videos — Denis's videos",
    description:
      "Browse the latest public videos uploaded to Denis's videos.",
    url: absoluteUrl("/"),
    type: "website",
  },
};

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();
  const initial = await trpc.videos.list.query({ limit: 24, sort });

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              All videos
            </Heading>
            <Text as="p" color="gray" size="2">
              Recent uploads from everyone on Denis's videos.
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>
      <Dashboard initial={initial} sort={sort} />
    </>
  );
}
