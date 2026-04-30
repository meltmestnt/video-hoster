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
import { VideoReactions } from "@/components/VideoReactions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { MorphLandingSignal } from "@/components/MorphLandingSignal";
import { absoluteUrl } from "@/lib/site";

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
  const description = video.description?.trim()
    ? video.description.slice(0, 200)
    : `Watch "${video.title}" by ${video.owner.name} on Denis's videos.`;
  const canonical = absoluteUrl(`/videos/${video.id}`);
  const ogImage = video.thumbnailUrl ?? undefined;

  return {
    title: video.title,
    description,
    alternates: { canonical },
    keywords: video.tags.map((t) => t.name),
    robots: isPrivate
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : undefined,
    openGraph: {
      type: "video.other",
      title: video.title,
      description,
      url: canonical,
      siteName: "Denis's videos",
      images: ogImage ? [{ url: ogImage }] : undefined,
      videos: video.videoUrl
        ? [{ url: video.videoUrl, type: video.mimeType }]
        : undefined,
    },
    twitter: {
      card: "player",
      title: video.title,
      description,
      images: ogImage ? [ogImage] : undefined,
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
  try {
    [video, comments, suggested] = await Promise.all([
      trpc.videos.byId.query({ id }),
      trpc.comments.listByVideo.query({ id }),
      trpc.videos.suggested.query({ id, limit: 10 }),
    ]);
  } catch {
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === video.owner.id;

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
          contentUrl: video.videoUrl ?? undefined,
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
          />
        ) : (
          <Box className="player-frame">
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray">Video is still processing.</Text>
            </Flex>
          </Box>
        )}
        <Flex align="center" gap="3" mt="4" wrap="wrap">
          <Heading size="6" style={{ flex: 1, minWidth: 0 }}>
            {video.title}
          </Heading>
          {video.visibility === "private" && (
            <Badge variant="soft" color="gray">
              Private
            </Badge>
          )}
          <Flex align="center" gap="2" wrap="wrap">
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
            {isOwner && (
              <DeleteVideoButton videoId={video.id} title={video.title} />
            )}
          </Flex>
        </Flex>
        <Flex align="center" gap="3" mt="1" mb="3" wrap="wrap">
          <Text size="2" color="gray">
            {video.owner.name}
          </Text>
          <Text size="2" color="gray">
            ·
          </Text>
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
        <div className="fade-in-delayed">
          <CommentsSection videoId={video.id} initial={comments} />
        </div>
      </Box>
      <Box className="fade-in-delayed">
        <Heading size="3" mb="3">
          Suggested
        </Heading>
        <SuggestedList items={suggested} />
      </Box>
    </div>
  );
}
