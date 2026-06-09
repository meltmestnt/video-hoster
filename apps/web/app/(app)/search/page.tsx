import { cache } from "react";
import type { Metadata } from "next";
import { Badge, Flex, Heading, Text } from "@radix-ui/themes";
import { getServerTrpc } from "@/lib/trpc-server";
import { VideoCard } from "@/components/VideoCard";
import { GifCard } from "@/components/GifCard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
import type { VideoSort } from "@repo/shared";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { buildSearchDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";

const VALID_SORTS: VideoSort[] = ["newest", "mostLiked", "mostDisliked"];
function normalizeSort(raw: string | undefined): VideoSort {
  return (VALID_SORTS as string[]).includes(raw ?? "")
    ? (raw as VideoSort)
    : "newest";
}

// React's `cache` dedupes the call within a single request so
// generateMetadata and the page itself share the same result instead
// of round-tripping the API twice. The closure key is the JSON-stringified
// args, which is what cache uses by reference equality on the params.
const fetchSearchResults = cache(
  async (q: string, tag: string, sort: VideoSort) => {
    if (!q && !tag) {
      return {
        videoResult: { items: [], nextCursor: null },
        gifResult: { items: [], nextCursor: null },
      };
    }
    const trpc = await getServerTrpc();
    const [videoResult, gifResult] = await Promise.all([
      trpc.videos.search.query({ q, tag, limit: 48, sort }),
      trpc.gifs.search.query({ q, tag, limit: 48, sort }),
    ]);
    return { videoResult, gifResult };
  },
);

interface SearchPageProps {
  searchParams: Promise<{ q?: string; tag?: string; sort?: string }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q = "", tag = "", sort: sortRaw } = await searchParams;
  const trimmedQ = q.trim();
  const trimmedTag = tag.trim();
  const sort = normalizeSort(sortRaw);
  const titleBits: string[] = [];
  if (trimmedQ) titleBits.push(`"${trimmedQ}"`);
  if (trimmedTag) titleBits.push(`#${trimmedTag}`);
  const titleSuffix = titleBits.length ? ` ${titleBits.join(" ")}` : "";

  // Don't index arbitrary user queries — they explode the URL surface and
  // add no value. Bare /search and tag-only pages stay indexable; tag
  // pages are useful entry points from external links.
  const indexable = !trimmedQ;

  // Pull counts so the snippet can surface real numbers ("12 funny GIFs
  // and videos…") instead of a generic blurb. Cached with the page render
  // so this is free.
  const { videoResult, gifResult } = await fetchSearchResults(
    trimmedQ,
    trimmedTag,
    sort,
  );
  const description = buildSearchDescription({
    q: trimmedQ,
    tag: trimmedTag,
    videoCount: videoResult.items.length,
    gifCount: gifResult.items.length,
    hasMore: !!videoResult.nextCursor || !!gifResult.nextCursor,
  });

  // Tag-only pages are real indexable surfaces, so their canonical must
  // include the tag — otherwise Google sees `/search?tag=cat` pointing
  // at bare `/search` and files it as "Alternate page with canonical
  // tag", which drops it from the index. Sort is intentionally omitted
  // so the default-sort URL wins as the canonical form. Query (q) pages
  // are noindex anyway and canonicalize back to bare `/search`.
  const canonicalPath =
    trimmedTag && !trimmedQ
      ? `/search?tag=${encodeURIComponent(trimmedTag)}`
      : "/search";

  return {
    title: `Search${titleSuffix}`,
    description,
    alternates: { canonical: absoluteUrl(canonicalPath) },
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

  const { videoResult, gifResult } = await fetchSearchResults(
    trimmedQ,
    trimmedTag,
    sort,
  );

  const videoItems = videoResult.items;
  const gifItems = gifResult.items;
  const totalItems = videoItems.length + gifItems.length;

  return (
    <>
      <div className="page-header">
        <Flex align="end" justify="between" gap="3" wrap="wrap" mb="3">
          <Heading size="6">
            <T k="page.search.heading" />
          </Heading>
          <VideoSortSelect value={sort} />
        </Flex>
        <Flex align="center" gap="2" mb="5" wrap="wrap">
          {trimmedQ && (
            <Text as="span" color="gray" size="2">
              <T k="page.search.resultsFor" vars={{ q: trimmedQ }} />
            </Text>
          )}
          {trimmedTag && (
            <Flex align="center" gap="1">
              <Text as="span" color="gray" size="2">
                <T k="page.search.tagLabel" />
              </Text>
              <Badge variant="soft" color="iris">
                {trimmedTag}
              </Badge>
            </Flex>
          )}
          {!trimmedQ && !trimmedTag && (
            <Text as="span" color="gray" size="2">
              <T k="page.search.empty.prompt" />
            </Text>
          )}
        </Flex>
      </div>

      {(trimmedQ || trimmedTag) && totalItems === 0 && (
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
            <T k="page.search.noMatch" />
          </Text>
        </Flex>
      )}

      {totalItems > 0 && (
        <div className="dashboard-grid">
          {videoItems.map((v, i) => (
            <VideoCard key={`v-${v.id}`} video={v} index={i} />
          ))}
          {gifItems.map((g, i) => (
            <GifCard
              key={`g-${g.id}`}
              gif={g}
              index={videoItems.length + i}
            />
          ))}
        </div>
      )}
    </>
  );
}
