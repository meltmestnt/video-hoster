import type { Metadata } from "next";
import { Badge, Flex, Heading, Text } from "@radix-ui/themes";
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

interface SearchPageProps {
  searchParams: Promise<{ q?: string; tag?: string; sort?: string }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q = "", tag = "" } = await searchParams;
  const trimmedQ = q.trim();
  const trimmedTag = tag.trim();
  const titleBits: string[] = [];
  if (trimmedQ) titleBits.push(`"${trimmedQ}"`);
  if (trimmedTag) titleBits.push(`#${trimmedTag}`);
  const titleSuffix = titleBits.length ? ` ${titleBits.join(" ")}` : "";

  // Don't index empty or arbitrary search queries — they explode the URL
  // surface and add no value. Only the bare /search and tag pages get
  // indexed; tag pages are useful entry points from external links.
  const indexable = !trimmedQ && (!trimmedTag || trimmedTag.length > 0);

  return {
    title: `Search${titleSuffix}`,
    description:
      titleBits.length > 0
        ? `Search results for ${titleBits.join(" and ")} on Video Hoster.`
        : "Search videos by title or tag on Video Hoster.",
    alternates: { canonical: absoluteUrl("/search") },
    robots: indexable
      ? undefined
      : { index: false, follow: true, googleBot: { index: false, follow: true } },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {

  const { q = "", tag = "", sort: sortRaw } = await searchParams;
  const trimmedQ = q.trim();
  const trimmedTag = tag.trim();
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();

  const result =
    trimmedQ || trimmedTag
      ? await trpc.videos.search.query({
          q: trimmedQ,
          tag: trimmedTag,
          limit: 48,
          sort,
        })
      : { items: [], nextCursor: null };

  const items = result.items;

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="3">
          <Heading size="6">Search</Heading>
          <VideoSortSelect value={sort} />
        </Flex>
        <Flex align="center" gap="2" mb="5" wrap="wrap">
          {trimmedQ && (
            <Text as="span" color="gray" size="2">
              Results for "{trimmedQ}"
            </Text>
          )}
          {trimmedTag && (
            <Flex align="center" gap="1">
              <Text as="span" color="gray" size="2">
                Tag:
              </Text>
              <Badge variant="soft" color="iris">
                {trimmedTag}
              </Badge>
            </Flex>
          )}
          {!trimmedQ && !trimmedTag && (
            <Text as="span" color="gray" size="2">
              Type a query in the search bar above, or click a tag to filter.
            </Text>
          )}
        </Flex>
      </div>

      {(trimmedQ || trimmedTag) && items.length === 0 && (
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
          <Text color="gray">No videos match your search.</Text>
        </Flex>
      )}

      {items.length > 0 && (
        <div className="dashboard-grid">
          {items.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
