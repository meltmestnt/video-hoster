import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { Dashboard } from "@/components/Dashboard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import { DropTile } from "@/components/DropTile";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All",
  description:
    "Browse the latest videos and GIFs uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
  alternates: { canonical: absoluteUrl("/all") },
  openGraph: {
    title: "All — vids&gifs",
    description: "Browse the latest videos and GIFs uploaded to vids&gifs.",
    url: absoluteUrl("/all"),
    type: "website",
  },
};

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

/**
 * The "All" tab content. Mirrors the feed shown on the signed-in `/`
 * dashboard but is open to anonymous viewers too — clicking the All tab
 * should always land on the videos+GIFs grid, never on the marketing
 * intro. The intro stays at `/` so the logo (which points there) keeps
 * acting as the landing page for anonymous users.
 */
export default async function AllPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const signedIn = !!session?.user;
  const { sort: sortRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();
  const [initial, initialGifs] = await Promise.all([
    trpc.videos.list.query({ limit: 20, sort }),
    trpc.gifs.list.query({ limit: 20, sort }),
  ]);

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="5">
          <div>
            <Heading size="6" mb="1">
              <T k="page.dashboard.heading" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="page.dashboard.subtitle" />
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>
      <DropTile mode="any" signedIn={signedIn} />
      <Dashboard initial={initial} initialGifs={initialGifs} sort={sort} />
    </>
  );
}
