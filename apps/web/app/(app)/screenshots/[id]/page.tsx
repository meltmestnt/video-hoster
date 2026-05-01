import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { DownloadIcon } from "@radix-ui/react-icons";
import { authOptions } from "@/lib/auth";
import { getServerTrpc } from "@/lib/trpc-server";
import { absoluteUrl } from "@/lib/site";
import { T } from "@/lib/i18n";
import { ShareButton } from "@/components/ShareButton";
import { DeleteScreenshotButton } from "@/components/DeleteScreenshotButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trpc = await getServerTrpc();
  try {
    const shot = await trpc.screenshots.byId.query({ id });
    return {
      title: shot.title,
      alternates: { canonical: absoluteUrl(`/screenshots/${shot.id}`) },
      robots:
        shot.visibility === "private"
          ? { index: false, follow: false }
          : undefined,
    };
  } catch {
    return {
      title: "Screenshot not found",
      robots: { index: false, follow: false },
    };
  }
}

export default async function ScreenshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  // Anonymous viewers get bounced to /login instead of seeing any of the
  // screenshot's metadata. Trade-off: search engines see a 307 too, so
  // this page won't get indexed.
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/screenshots/${id}`)}`);
  }
  const trpc = await getServerTrpc();

  let shot;
  let me: Awaited<
    ReturnType<Awaited<ReturnType<typeof getServerTrpc>>["auth"]["me"]["query"]>
  > = null;
  try {
    [shot, me] = await Promise.all([
      trpc.screenshots.byId.query({ id }),
      trpc.auth.me.query(),
    ]);
  } catch {
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === shot.owner.id;
  const isAdmin = me?.role === "admin";
  const canDelete = isOwner || isAdmin;

  const downloadName = `${shot.title || "screenshot"}.${
    shot.mimeType === "image/png"
      ? "png"
      : shot.mimeType === "image/webp"
        ? "webp"
        : "jpg"
  }`;

  return (
    <Box>
      {/* Always stacked — title on top, action row underneath, same as
          the video and gif detail pages. The action set was too wide to
          share a row with the heading even on desktop without crushing
          the title. */}
      <Flex direction="column" align="start" gap="3" mb="3">
        <Heading size="6" style={{ wordBreak: "break-word" }}>
          {shot.title}
        </Heading>
        <Flex align="center" gap="2" wrap="wrap">
          {shot.visibility === "private" && (
            <Badge variant="soft" color="gray">
              <T k="common.private" />
            </Badge>
          )}
          <ShareButton path={`/screenshots/${shot.id}`} title={shot.title} />
          {shot.url && session?.user && (
            <Button asChild variant="soft" color="iris">
              <a
                href={shot.url}
                download={downloadName}
                rel="noopener noreferrer"
              >
                <DownloadIcon />
                <T k="screenshots.detail.download" />
              </a>
            </Button>
          )}
          {canDelete && (
            <DeleteScreenshotButton
              screenshotId={shot.id}
              title={shot.title}
            />
          )}
        </Flex>
      </Flex>
      <Flex align="center" gap="3" mb="4" wrap="wrap">
        <Text size="2" color="gray">
          {shot.owner.name}
        </Text>
        <Text size="2" color="gray">
          ·
        </Text>
        <Text size="2" color="gray">
          {new Date(shot.createdAt).toLocaleDateString()}
        </Text>
        {shot.width && shot.height && (
          <>
            <Text size="2" color="gray">
              ·
            </Text>
            <Text size="2" color="gray">
              {shot.width} × {shot.height}
            </Text>
          </>
        )}
      </Flex>
      {!session?.user ? (
        <Box
          className="player-frame"
          style={{ background: "black", overflow: "hidden" }}
        >
          <Flex
            className="player-overlay"
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
              <T k="page.screenshot.signInOverlay" />
            </Text>
            <Button asChild size="2" variant="solid">
              <Link href={`/login?callbackUrl=/screenshots/${shot.id}`}>
                <T k="page.screenshot.signInButton" />
              </Link>
            </Button>
          </Flex>
        </Box>
      ) : shot.url ? (
        <Box
          style={{
            borderRadius: "var(--radius-3)",
            overflow: "hidden",
            background: "black",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.url}
            alt={shot.title}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </Box>
      ) : (
        <Text color="gray">
          <T k="screenshots.detail.notFound" />
        </Text>
      )}
    </Box>
  );
}
