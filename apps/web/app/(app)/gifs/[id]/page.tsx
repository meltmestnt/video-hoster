import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Metadata } from "next";
import { Badge, Box, Flex, Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { GifCard } from "@/components/GifCard";
import { GifReactions } from "@/components/GifReactions";
import { GifCommentsSection } from "@/components/GifCommentsSection";
import { DeleteGifButton } from "@/components/DeleteGifButton";
import { SubscribeButton } from "@/components/SubscribeButton";
import { ShareButton } from "@/components/ShareButton";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trpc = await getServerTrpc();
  let gif;
  try {
    gif = await trpc.gifs.byId.query({ id });
  } catch {
    return {
      title: "GIF not found",
      robots: { index: false, follow: false },
    };
  }
  const isPrivate = gif.visibility === "private";
  const description = gif.description?.trim()
    ? gif.description.slice(0, 200)
    : `GIF "${gif.title}" by ${gif.owner.name} on Video Hoster.`;
  const canonical = absoluteUrl(`/gifs/${gif.id}`);
  return {
    title: gif.title,
    description,
    alternates: { canonical },
    keywords: gif.tags.map((t) => t.name),
    robots: isPrivate
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : undefined,
    openGraph: {
      type: "article",
      title: gif.title,
      description,
      url: canonical,
      siteName: "Video Hoster",
      images: gif.gifUrl ? [{ url: gif.gifUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: gif.title,
      description,
      images: gif.gifUrl ? [gif.gifUrl] : undefined,
    },
  };
}

export default async function GifPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const trpc = await getServerTrpc();

  let gif;
  let comments;
  let suggested;
  try {
    [gif, comments, suggested] = await Promise.all([
      trpc.gifs.byId.query({ id }),
      trpc.comments.listByGif.query({ id, sort: "newest" }),
      trpc.gifs.suggested.query({ id, limit: 10 }),
    ]);
  } catch {
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === gif.owner.id;

  const jsonLd =
    gif.visibility === "private"
      ? null
      : {
          "@context": "https://schema.org",
          "@type": "ImageObject",
          name: gif.title,
          description:
            gif.description?.trim() ||
            `GIF "${gif.title}" by ${gif.owner.name}.`,
          contentUrl: gif.gifUrl ?? undefined,
          uploadDate: new Date(gif.createdAt).toISOString(),
          encodingFormat: "image/gif",
          author: { "@type": "Person", name: gif.owner.name },
          keywords: gif.tags.map((t) => t.name).join(", ") || undefined,
        };

  return (
    <div className="video-page">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Box>
        <Box
          className="player-frame"
          style={{ background: "black", overflow: "hidden" }}
        >
          {gif.gifUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gif.gifUrl}
              alt={gif.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">
                <T k="page.gif.processing" />
              </Text>
            </Flex>
          )}
        </Box>
        <Flex align="center" gap="3" mt="4" wrap="wrap">
          <Heading size="6" style={{ flex: 1, minWidth: 0 }}>
            {gif.title}
          </Heading>
          <Badge variant="solid" color="iris">GIF</Badge>
          {gif.visibility === "private" && (
            <Badge variant="soft" color="gray">
              <T k="card.private" />
            </Badge>
          )}
          <Flex align="center" gap="2" wrap="wrap">
            <GifReactions
              gifId={gif.id}
              initialLikes={gif.likeCount}
              initialDislikes={gif.dislikeCount}
              initialReaction={gif.viewerReaction}
            />
            <ShareButton path={`/gifs/${gif.id}`} title={gif.title} />
            {isOwner && (
              <DeleteGifButton gifId={gif.id} title={gif.title} />
            )}
          </Flex>
        </Flex>
        <Flex align="center" gap="3" mt="1" mb="3" wrap="wrap">
          <Text size="2" color="gray">{gif.owner.name}</Text>
          <SubscribeButton targetUserId={gif.owner.id} />
          <Text size="2" color="gray">·</Text>
          <Text size="2" color="gray">
            {new Date(gif.createdAt).toLocaleDateString()}
          </Text>
        </Flex>
        {gif.tags.length > 0 && (
          <Flex gap="1" wrap="wrap" mb="3">
            {gif.tags.map((t) => (
              <Badge key={t.id} asChild variant="soft" color="iris">
                <Link
                  href={`/search?tag=${encodeURIComponent(t.name)}`}
                  style={{ cursor: "pointer" }}
                >
                  {t.name}
                </Link>
              </Badge>
            ))}
          </Flex>
        )}
        {gif.description && (
          <Text as="p" size="3" mb="5" style={{ whiteSpace: "pre-wrap" }}>
            {gif.description}
          </Text>
        )}
        <GifCommentsSection gifId={gif.id} initial={comments} />
      </Box>
      <Box>
        <Heading size="3" mb="3">
          <T k="page.gif.similar" />
        </Heading>
        {suggested.length === 0 ? (
          <Text size="2" color="gray">
            <T k="page.gif.noSimilar" />
          </Text>
        ) : (
          <Flex direction="column" gap="3">
            {suggested.map((g, i) => (
              <GifCard key={g.id} gif={g} index={i} />
            ))}
          </Flex>
        )}
      </Box>
    </div>
  );
}
