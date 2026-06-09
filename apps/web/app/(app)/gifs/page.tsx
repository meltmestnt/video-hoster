import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { GifsInfiniteList } from "@/components/GifsInfiniteList";
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
  const canonical = absoluteUrl(buildPagedUrl("/gifs", page));
  const titleSuffix = page > 1 ? ` — page ${page}` : "";
  return {
    title: `All GIFs${titleSuffix}`,
    description:
      "Browse the latest public GIFs uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
    alternates: { canonical },
    openGraph: {
      title: `All GIFs${titleSuffix} — vids&gifs`,
      description: "Browse the latest public GIFs uploaded to vids&gifs.",
      url: canonical,
      type: "website",
    },
  };
}

export default async function GifsPage({
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
  // Only forward `page` when paging is actually requested. Page 1 stays
  // on the cursor-mode code path (no offset) so the cache key matches
  // the bare `/gifs` request.
  const initial = await trpc.gifs.list.query({
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
              <T k="page.gifs.heading" />
            </Heading>
            <Text as="p" color="gray" size="2">
              <T k="page.gifs.subtitle" />
            </Text>
          </div>
          <VideoSortSelect value={sort} />
        </Flex>
      </div>
      <DropTile mode="gif" signedIn={signedIn} />
      <GifsInfiniteList
        initial={initial}
        sort={sort}
        signedIn={signedIn}
        initialPage={page}
      />
      <SeoPagination
        path="/gifs"
        page={page}
        hasNextPage={!!initial.nextCursor}
      />
    </>
  );
}
