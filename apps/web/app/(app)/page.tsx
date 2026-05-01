import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { Dashboard } from "@/components/Dashboard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import { AnonymousIntro } from "@/components/AnonymousIntro";
import { DropTile } from "@/components/DropTile";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// The root path is the natural landing for any "vids and gifs" /
// "vidsandgifs" search, so we use `title.absolute` here to break out of
// the layout's "%s — vids&gifs" template and lead with the brand and
// every common spelling. Description repeats them in plain prose so the
// SERP snippet (which Google often pulls verbatim from this string)
// reads like a description of what the site does.
export const metadata: Metadata = {
  title: {
    absolute:
      "vids & gifs — upload videos and GIFs, convert MP4 to GIF, share in your browser",
  },
  description:
    "vids & gifs (vidsandgifs.xyz) lets you upload videos and GIFs, convert MP4 to GIF, extract audio, capture screenshots from any frame, and share them publicly or privately. Free, no installs, runs in your browser. Browse the latest community uploads or sign up to post your own.",
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title:
      "vids & gifs — upload videos and GIFs, convert, share in your browser",
    description:
      "Upload videos and GIFs, convert MP4 to GIF, extract audio, capture screenshots, and share. Free in-browser tools at vidsandgifs.xyz.",
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
  const session = await getServerSession(authOptions);
  // Signed-out visitors see the marketing landing instead of the feed —
  // they can still browse content via the "Browse all videos" link or by
  // navigating to /videos / /gifs / /screenshots directly.
  if (!session?.user) {
    return <AnonymousIntro />;
  }

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
      <DropTile mode="any" signedIn />
      <Dashboard initial={initial} initialGifs={initialGifs} sort={sort} />
    </>
  );
}
