import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { Dashboard } from "@/components/Dashboard";
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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>;
}): Promise<Metadata> {
  const { page: pageRaw } = await searchParams;
  const page = parsePageParam(pageRaw);
  const canonical = absoluteUrl(buildPagedUrl("/all", page));
  const titleSuffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `All${titleSuffix}`,
    description:
      "Browse the latest videos and GIFs uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
    alternates: { canonical },
    openGraph: {
      title: `All${titleSuffix} — vids&gifs`,
      description: "Browse the latest videos and GIFs uploaded to vids&gifs.",
      url: canonical,
      type: "website",
    },
  };
}

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
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const signedIn = !!session?.user;
  const { sort: sortRaw, page: pageRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);
  const page = parsePageParam(pageRaw);

  const trpc = await getServerTrpc();
  const pagedInput = page > 1 ? { page } : {};
  const [initial, initialGifs] = await Promise.all([
    trpc.videos.list.query({ limit: LISTING_PAGE_LIMIT, sort, ...pagedInput }),
    trpc.gifs.list.query({ limit: LISTING_PAGE_LIMIT, sort, ...pagedInput }),
  ]);

  // Either list still having a next cursor means there's more content
  // on page+1 — even if one list ran out, the other might still feed
  // the merged grid.
  const hasNextPage = !!initial.nextCursor || !!initialGifs.nextCursor;

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
      <Dashboard
        initial={initial}
        initialGifs={initialGifs}
        sort={sort}
        initialPage={page}
      />
      <SeoPagination path="/all" page={page} hasNextPage={hasNextPage} />
    </>
  );
}
