import type { Metadata } from "next";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { getServerTrpc } from "@/lib/trpc-server";
import { GifCard } from "@/components/GifCard";
import { VideoSortSelect } from "@/components/VideoSortSelect";
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
  title: "All GIFs",
  description:
    "Browse the latest public GIFs uploaded to vids&gifs. Sort by newest, most liked, or most disliked.",
  alternates: { canonical: absoluteUrl("/gifs") },
  openGraph: {
    title: "All GIFs — vids&gifs",
    description: "Browse the latest public GIFs uploaded to vids&gifs.",
    url: absoluteUrl("/gifs"),
    type: "website",
  },
};

export default async function GifsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: sortRaw } = await searchParams;
  const sort = normalizeSort(sortRaw);

  const trpc = await getServerTrpc();
  const result = await trpc.gifs.list.query({ limit: 24, sort });

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
            <T k="page.gifs.empty" />
          </Text>
        </Flex>
      ) : (
        <div className="dashboard-grid">
          {result.items.map((g, i) => (
            <GifCard key={g.id} gif={g} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
