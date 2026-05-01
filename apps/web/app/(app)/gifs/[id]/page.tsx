import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Metadata } from "next";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
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
    : `GIF "${gif.title}" by ${gif.owner.name} on vids&gifs.`;
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
      siteName: "vids&gifs",
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
  // Anonymous viewers get bounced to /login instead of seeing any of the
  // GIF's metadata. Trade-off: search engines see a 307 too, so this
  // page won't get indexed.
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/gifs/${id}`)}`);
  }
  const trpc = await getServerTrpc();

  let gif;
  let comments;
  let suggested;
  let me: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServerTrpc>>["auth"]["me"]["query"]>
  > = null;
  try {
    [gif, comments, suggested, me] = await Promise.all([
      trpc.gifs.byId.query({ id }),
      trpc.comments.listByGif.query({ id, sort: "newest" }),
      trpc.gifs.suggested.query({ id, limit: 10 }),
      trpc.auth.me.query(),
    ]);
  } catch {
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === gif.owner.id;
  const isAdmin = me?.role === "admin";
  const canDelete = isOwner || isAdmin;

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
          {!session?.user ? (
            <Flex
              align="center"
              justify="center"
              direction="column"
              gap="3"
              style={{
                height: "100%",
                background: "rgba(0, 0, 0, 0.6)",
              }}
            >
              <Text size="3" weight="medium" style={{ color: "white" }}>
                <T k="page.gif.signInOverlay" />
              </Text>
              <Button asChild size="2" variant="solid">
                <Link href={`/login?callbackUrl=/gifs/${gif.id}`}>
                  <T k="page.gif.signInButton" />
                </Link>
              </Button>
            </Flex>
          ) : gif.gifUrl ? (
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
        <Flex
          direction={{ initial: "column", sm: "row" }}
          align={{ initial: "start", sm: "center" }}
          gap="3"
          mt="4"
        >
          <Heading
            size="6"
            style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}
          >
            {gif.title}
          </Heading>
          <Flex align="center" gap="2" wrap="wrap">
            <Badge variant="solid" color="iris">
              GIF
            </Badge>
            {gif.visibility === "private" && (
              <Badge variant="soft" color="gray">
                <T k="card.private" />
              </Badge>
            )}
            <GifReactions
              gifId={gif.id}
              initialLikes={gif.likeCount}
              initialDislikes={gif.dislikeCount}
              initialReaction={gif.viewerReaction}
            />
            <ShareButton path={`/gifs/${gif.id}`} title={gif.title} />
            {canDelete && (
              <DeleteGifButton gifId={gif.id} title={gif.title} />
            )}
          </Flex>
        </Flex>
        <Flex align="center" gap="3" mt="3" mb="3" wrap="wrap">
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
