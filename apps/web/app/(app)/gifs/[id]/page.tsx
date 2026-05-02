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
import { ViewCounter } from "@/components/ViewCounter";
import { MorphLandingSignal } from "@/components/MorphLandingSignal";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { parseAnonViewLimitError } from "@/lib/anon-view-limit";
import { AnonViewLimitNotice } from "@/components/AnonViewLimitNotice";
import { buildMediaDescription } from "@/lib/seo";

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
  const description = buildMediaDescription({
    kind: "gif",
    title: gif.title,
    description: gif.description,
    ownerName: gif.owner.name,
    tags: gif.tags,
    viewCount: gif.viewCount,
    likeCount: gif.likeCount,
    createdAt: gif.createdAt,
  });
  const canonical = absoluteUrl(`/gifs/${gif.id}`);
  // og:image alone shows the GIF inline on most platforms (the file is
  // an animated GIF, so Discord/Slack play it). Adding og:video on top
  // unlocks autoplay-with-sound on platforms that prefer video tags
  // (Twitter, Facebook). Private gifs already throw NotFound for
  // anonymous requests, so this branch never runs for them.
  const ogMedia = !isPrivate && gif.gifUrl ? gif.gifUrl : undefined;
  return {
    title: gif.title,
    description,
    alternates: {
      canonical,
      // oEmbed discovery — Slack and a few other consumers fetch this
      // URL to get a `type: "photo"` response with the .gif URL for
      // inline playback. See app/api/oembed/route.ts.
      types: {
        "application/json+oembed": absoluteUrl(
          `/api/oembed?url=${encodeURIComponent(canonical)}`,
        ),
      },
    },
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
      images: ogMedia ? [{ url: ogMedia }] : undefined,
      ...(ogMedia
        ? {
            videos: [
              {
                url: ogMedia,
                secureUrl: ogMedia,
                type: "image/gif",
              },
            ],
          }
        : {}),
    },
    twitter: {
      // Player card pointing at the embed iframe so the gif autoplays
      // inline on Twitter, just like the main /gifs/[id] surface.
      card: ogMedia ? "player" : "summary_large_image",
      title: gif.title,
      description,
      images: ogMedia ? [ogMedia] : undefined,
      ...(ogMedia
        ? {
            players: [
              {
                playerUrl: absoluteUrl(`/embed/g/${gif.id}`),
                streamUrl: ogMedia,
                width: 480,
                height: 480,
              },
            ],
          }
        : {}),
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
  // Public GIFs render for anonymous viewers (link previews, scrapers,
  // signed-out browsing). The page already shows a sign-in overlay over
  // the player frame for them; private GIFs throw NotFound from the API
  // for anyone except their owner so no extra redirect is needed.
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
  } catch (err) {
    if (parseAnonViewLimitError(err) === "gif") {
      return <AnonViewLimitNotice kind="gif" callbackPath={`/gifs/${id}`} />;
    }
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
      <MorphLandingSignal />
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
            <Flex
              className="player-overlay"
              align="center"
              justify="center"
              style={{ height: "100%" }}
            >
              <Text color="gray">
                <T k="page.gif.processing" />
              </Text>
            </Flex>
          )}
        </Box>
        <Flex
          // Always stacked — title (with the small GIF label inline) on
          // top, action row underneath. Matches the video detail page;
          // the row layout never had enough room for the action set
          // without collapsing the heading.
          direction="column"
          align="start"
          gap="3"
          mt="4"
        >
          <Flex align="center" gap="2" wrap="wrap">
            <Heading size="6" style={{ wordBreak: "break-word" }}>
              {gif.title}
            </Heading>
            {/* Small kind label sits next to the title so the action row
                below isn't visually crowded by a non-action pill. */}
            <Badge variant="soft" color="iris" size="2">
              GIF
            </Badge>
            {gif.visibility === "private" && (
              <Badge variant="soft" color="gray" size="2">
                <T k="card.private" />
              </Badge>
            )}
            {gif.source === "telegram" && (
              <Badge variant="soft" color="sky" size="2">
                <T k="card.viaTelegram" />
              </Badge>
            )}
          </Flex>
          <Flex align="center" gap="2" wrap="wrap">
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
          {gif.owner.username ? (
            <Link
              href={`/@${gif.owner.username}`}
              style={{
                color: "var(--gray-12)",
                fontSize: "var(--font-size-2)",
                textDecoration: "none",
              }}
            >
              {gif.owner.name}
            </Link>
          ) : (
            <Text size="2" color="gray">{gif.owner.name}</Text>
          )}
          {/* Hide subscribe-to-self entirely; the API rejects it but the
              button shouldn't show up in the first place. */}
          {!!session?.user && session.user.id !== gif.owner.id && (
            <SubscribeButton targetUserId={gif.owner.id} />
          )}
          <Text size="2" color="gray">·</Text>
          <ViewCounter
            kind="gif"
            id={gif.id}
            initialCount={gif.viewCount ?? 0}
          />
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
