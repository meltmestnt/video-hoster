import { notFound } from "next/navigation";
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
  const trpc = await getServerTrpc();

  let shot;
  try {
    shot = await trpc.screenshots.byId.query({ id });
  } catch {
    notFound();
  }

  const isOwner = !!session?.user?.id && session.user.id === shot.owner.id;

  const downloadName = `${shot.title || "screenshot"}.${
    shot.mimeType === "image/png"
      ? "png"
      : shot.mimeType === "image/webp"
        ? "webp"
        : "jpg"
  }`;

  return (
    <Box>
      <Flex align="center" gap="3" mb="3" wrap="wrap">
        <Heading size="6" style={{ flex: 1, minWidth: 0 }}>
          {shot.title}
        </Heading>
        {shot.visibility === "private" && (
          <Badge variant="soft" color="gray">
            <T k="common.private" />
          </Badge>
        )}
        <ShareButton path={`/screenshots/${shot.id}`} title={shot.title} />
        {shot.url && (
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
        {isOwner && (
          <DeleteScreenshotButton
            screenshotId={shot.id}
            title={shot.title}
          />
        )}
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
      {shot.url ? (
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
