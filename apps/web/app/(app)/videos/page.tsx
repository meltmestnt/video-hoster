import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { VideosInfiniteList } from "@/components/VideosInfiniteList";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import { DropTile } from "@/components/DropTile";
import { SeoPagination } from "@/components/SeoPagination";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import {
  LISTING_PAGE_LIMIT,
  buildPagedUrl,
  parsePageParam,
} from "@/lib/seo-pagination";

export const dynamic = "force-dynamic";

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}): Promise<Metadata> {
  const { page: pageRaw } = await searchParams;
  const page = parsePageParam(pageRaw);
  const canonical = absoluteUrl(buildPagedUrl("/videos", page));
  const titleSuffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `All videos${titleSuffix}`,
    description:
      "Browse the latest public videos uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
    alternates: { canonical },
    openGraph: {
      title: `All videos${titleSuffix} — vids&gifs`,
      description: "Browse the latest public videos uploaded to vids&gifs.",
      url: canonical,
      type: "website",
    },
  };
}

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const { sort: sortRaw, page: pageRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);
  const page = parsePageParam(pageRaw);

  const session = await getServerSession(authOptions);
  const signedIn = !!session?.user;
  const trpc = await getServerTrpc();
  const initial = await trpc.videos.list.query({
    limit: LISTING_PAGE_LIMIT,
    sort,
    ...(page > 1 ? { page } : {}),
  });

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
      <VideosInfiniteList initial={initial} sort={sort} initialPage={page} />
      <SeoPagination
        path="/videos"
        page={page}
        hasNextPage={!!initial.nextCursor}
      />
    </>
  );
}
