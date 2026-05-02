import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import type { Metadata } from "next";
import { Badge, Box, Flex, Heading, Text } from "@radix-ui/themes";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CommentsSection } from "@/components/CommentsSection";
import { SuggestedList } from "@/components/SuggestedList";
import { DeleteVideoButton } from "@/components/DeleteVideoButton";
import { VideoDownloadButtons } from "@/components/VideoDownloadButtons";
import { VideoReactions } from "@/components/VideoReactions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SubscribeButton } from "@/components/SubscribeButton";
import { VideoAudioControls } from "@/components/VideoAudioControls";
import { ShareButton } from "@/components/ShareButton";
import { ViewCounter } from "@/components/ViewCounter";
import { MorphLandingSignal } from "@/components/MorphLandingSignal";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { parseAnonViewLimitError } from "@/lib/anon-view-limit";
import { AnonViewLimitNotice } from "@/components/AnonViewLimitNotice";
import { AnonPreviewLock } from "@/components/AnonPreviewLock";
import { ANON_VIDEO_PREVIEW_SECONDS } from "@repo/shared";
import { buildMediaDescription } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trpc = await getServerTrpc();
  let video;
  try {
    video = await trpc.videos.byId.query({ id });
  } catch {
    return {
      title: "Video not found",
      robots: { index: false, follow: false },
    };
  }
  // Private videos must not be indexed even if we 200 for their owner.
  const isPrivate = video.visibility === "private";
  const description = buildMediaDescription({
    kind: "video",
    title: video.title,
    description: video.description,
    ownerName: video.owner.name,
    tags: video.tags,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    createdAt: video.createdAt,
  });
  const canonical = absoluteUrl(`/videos/${video.id}`);
  const ogImage = video.thumbnailUrl ?? undefined;
  // og:video lets Discord, iMessage, Slack, Reddit, and Facebook render
  // an inline playable preview when someone pastes a vidsandgifs link.
  // The URL we hand out is the same signed media-proxy URL the page
  // itself uses (1h TTL), so a leaked link buys at most an hour of
  // hotlinking before re-scraping refreshes it. Private videos already
  // throw NotFound for anonymous requests so this branch never runs for
  // them.
  const ogVideo = !isPrivate && video.videoUrl ? video.videoUrl : undefined;
  const ogVideoType = video.mimeType ?? "video/mp4";

  return {
    title: video.title,
    description,
    alternates: {
      canonical,
      // oEmbed discovery — Slack, Notion, and a handful of other
      // unfurling consumers fetch this URL after seeing the alternate
      // link and use the JSON response (iframe HTML) for inline
      // playback. See app/api/oembed/route.ts for the response shape.
      types: {
        "application/json+oembed": absoluteUrl(
          `/api/oembed?url=${encodeURIComponent(canonical)}`,
        ),
      },
    },
    keywords: video.tags.map((t) => t.name),
    robots: isPrivate
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : undefined,
    openGraph: {
      type: "video.other",
      title: video.title,
      description,
      url: canonical,
      siteName: "vids&gifs",
      images: ogImage ? [{ url: ogImage }] : undefined,
      ...(ogVideo
        ? {
            videos: [
              {
                url: ogVideo,
                secureUrl: ogVideo,
                type: ogVideoType,
                width: 1280,
                height: 720,
              },
            ],
          }
        : {}),
    },
    twitter: {
      // Player card with our own iframe so Twitter renders an inline
      // player styled like the main /videos/[id] surface (black
      // letterbox, native controls). Falls back to summary card for
      // private items where the iframe would 404.
      card: ogVideo ? "player" : "summary_large_image",
      title: video.title,
      description,
      images: ogImage ? [ogImage] : undefined,
      ...(ogVideo
        ? {
            players: [
              {
                playerUrl: absoluteUrl(`/embed/v/${video.id}`),
                streamUrl: ogVideo,
                width: 1280,
                height: 720,
              },
            ],
          }
        : {}),
    },
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  // Public videos render for anonymous viewers (Googlebot, link previews,
  // signed-out browsing). Private videos throw NotFound from the API for
  // anyone except their owner — no extra redirect needed here.
  const trpc = await getServerTrpc();

  let video;
  let comments;
  let suggested;
  let me: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServerTrpc>>["auth"]["me"]["query"]>
  > = null;
  try {
    [video, comments, suggested, me] = await Promise.all([
      trpc.videos.byId.query({ id }),
      trpc.comments.listByVideo.query({ id }),
      trpc.videos.suggested.query({ id, limit: 10 }),
      session?.user ? trpc.auth.me.query() : Promise.resolve(null),
    ]);
  } catch (err) {
    // Anon hit the daily distinct-video cap — swap in a sign-up CTA
    // instead of the player. Anything else (404, transient) flows
    // through the existing notFound path.
    if (parseAnonViewLimitError(err) === "video") {
      return <AnonViewLimitNotice kind="video" callbackPath={`/videos/${id}`} />;
    }
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === video.owner.id;
  const isAdmin = me?.role === "admin";
  const canDelete = isOwner || isAdmin;

  const jsonLd =
    video.visibility === "private"
      ? null
      : {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: video.title,
          description:
            video.description?.trim() ||
            `Video "${video.title}" by ${video.owner.name}.`,
          thumbnailUrl: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
          uploadDate: new Date(video.createdAt).toISOString(),
          // contentUrl is the signed S3 stream — never expose it to
          // anonymous viewers (or to crawlers, which is what the JSON-LD
          // is for). Signed-in users get the playable URL through the
          // <VideoPlayer> further down, so they don't need it here either.
          // Leave embedUrl as the page URL so search engines still wire
          // structured-data video previews to vidsandgifs.xyz.
          embedUrl: absoluteUrl(`/videos/${video.id}`),
          encodingFormat: video.mimeType,
          keywords: video.tags.map((t) => t.name).join(", ") || undefined,
          author: {
            "@type": "Person",
            name: video.owner.name,
          },
          interactionStatistic: [
            {
              "@type": "InteractionCounter",
              interactionType: { "@type": "LikeAction" },
              userInteractionCount: video.likeCount,
            },
            {
              "@type": "InteractionCounter",
              interactionType: { "@type": "DislikeAction" },
              userInteractionCount: video.dislikeCount,
            },
          ],
        };

  return (
    <div className="video-page">
      {jsonLd && (
        <script
          type="application/ld+json"
          // Static server-rendered string; safe to inline.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <MorphLandingSignal />
      <Box>
        {video.videoUrl ? (
          <VideoPlayer
            url={video.videoUrl}
            thumbnailUrl={video.thumbnailUrl}
            videoId={video.id}
            title={video.title}
            audioTracks={video.audioTracks?.map((t) => ({
              id: t.id,
              url: t.audioTemplate.url,
              startSeconds: t.startSeconds,
              volume: t.volume,
            }))}
            mainAudioMuted={video.mainAudioMuted}
            // Anon viewers get a 30s preview and no upfront byte fetch —
            // the player won't request anything until they click play.
            // Both props are no-ops once a real session is attached.
            lazyLoad={!session?.user}
            maxPlaybackSeconds={
              session?.user ? undefined : ANON_VIDEO_PREVIEW_SECONDS
            }
            previewLockOverlay={
              session?.user ? undefined : (
                <AnonPreviewLock callbackPath={`/videos/${video.id}`} />
              )
            }
          />
        ) : (
          <Box className="player-frame">
            <Flex
              className="player-overlay"
              align="center"
              justify="center"
              style={{ height: "100%" }}
            >
              <Text color="gray">
                <T k="page.video.processing" />
              </Text>
            </Flex>
          </Box>
        )}
        <Flex
          // Stay stacked until ≥md (768px) — at sm widths the action row
          // Always stacked — title on top, action row underneath. The row
          // layout collided with the action button set (reactions +
          // favorite + share + download + delete) at every width we tried,
          // so the page reads cleaner with a deliberate two-row block.
          direction="column"
          align="start"
          gap="3"
          mt="4"
        >
          <Heading
            size="6"
            style={{ wordBreak: "break-word" }}
          >
            {video.title}
          </Heading>
          <Flex
            align="center"
            justify="end"
            gap="2"
            wrap="wrap"
            style={{ rowGap: "8px" }}
          >
            {video.visibility === "private" && (
              <Badge variant="soft" color="gray">
                <T k="card.private" />
              </Badge>
            )}
            <VideoReactions
              videoId={video.id}
              initialLikes={video.likeCount}
              initialDislikes={video.dislikeCount}
              initialReaction={video.viewerReaction}
            />
            {!!session?.user?.id && (
              <FavoriteButton
                videoId={video.id}
                initial={video.viewerFavorited ?? false}
              />
            )}
            <ShareButton
              path={`/videos/${video.id}`}
              title={video.title}
            />
            {!!session?.user &&
              video.videoUrl &&
              video.downloadPolicy !== "none" && (
                <VideoDownloadButtons
                  videoUrl={video.videoUrl}
                  videoMimeType={video.mimeType}
                  baseFilename={video.title}
                  policy={video.downloadPolicy}
                />
              )}
            {canDelete && (
              <DeleteVideoButton videoId={video.id} title={video.title} />
            )}
          </Flex>
        </Flex>
        <Flex align="center" gap="3" mt="3" mb="3" wrap="wrap">
          {video.owner.username ? (
            <Link
              href={`/@${video.owner.username}`}
              style={{
                color: "var(--gray-12)",
                fontSize: "var(--font-size-2)",
                textDecoration: "none",
              }}
            >
              {video.owner.name}
            </Link>
          ) : (
            <Text size="2" color="gray">{video.owner.name}</Text>
          )}
          {/* Subscribe is account-only; hide for anon to keep the page
              free of auth-gated UI that would 401 on click. Also hide
              when viewing your own video — subscribe-to-self is rejected
              upstream and shouldn't even be a clickable affordance. */}
          {!!session?.user && session.user.id !== video.owner.id && (
            <SubscribeButton targetUserId={video.owner.id} />
          )}
          <Text size="2" color="gray">·</Text>
          <ViewCounter
            kind="video"
            id={video.id}
            initialCount={video.viewCount ?? 0}
          />
          <Text size="2" color="gray">·</Text>
          <Text size="2" color="gray">
            {new Date(video.createdAt).toLocaleDateString()}
          </Text>
        </Flex>
        {video.tags.length > 0 && (
          <Flex gap="1" wrap="wrap" mb="3">
            {video.tags.map((t) => (
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
        {video.description && (
          <Text as="p" size="3" mb="5" style={{ whiteSpace: "pre-wrap" }}>
            {video.description}
          </Text>
        )}
        {isOwner && (
          <VideoAudioControls
            videoId={video.id}
            initialMainMuted={video.mainAudioMuted}
            initialTracks={video.audioTracks ?? []}
          />
        )}
        <div className="fade-in-delayed">
          <CommentsSection videoId={video.id} initial={comments} />
        </div>
      </Box>
      <Box className="fade-in-delayed">
        <Heading size="3" mb="3">
          <T k="page.video.suggested" />
        </Heading>
        <SuggestedList items={suggested} />
      </Box>
    </div>
  );
}
