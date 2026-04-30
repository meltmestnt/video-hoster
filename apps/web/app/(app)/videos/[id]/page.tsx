import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
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

export const dynamic = "force-dynamic";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
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

  return (
    <div className="video-page">
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
