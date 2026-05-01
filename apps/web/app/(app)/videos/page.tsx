import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { VideosInfiniteList } from "@/components/VideosInfiniteList";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import { DropTile } from "@/components/DropTile";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

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
    "Browse the latest public videos uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
  alternates: { canonical: absoluteUrl("/videos") },
  openGraph: {
    title: "All videos — vids&gifs",
    description: "Browse the latest public videos uploaded to vids&gifs.",
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

  const session = await getServerSession(authOptions);
  const signedIn = !!session?.user;
  const trpc = await getServerTrpc();
  const initial = await trpc.videos.list.query({ limit: 20, sort });

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              <T k="page.videos.heading" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="page.videos.subtitle" />
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>
      <DropTile mode="video" signedIn={signedIn} />
      <VideosInfiniteList initial={initial} sort={sort} />
    </>
  );
}
