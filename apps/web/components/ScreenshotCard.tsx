"use client";

import { Badge, Box, Button, Card, Flex, Text } from "@radix-ui/themes";
import { DownloadIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useT } from "@/lib/i18n";

interface ScreenshotCardData {
  id: string;
  title: string;
  url: string | null;
  visibility: "public" | "private";
  width: number | null;
  height: number | null;
  createdAt: Date | string;
  owner?: {
    name: string;
    username?: string | null;
  };
}

export function ScreenshotCard({
  shot,
  index = 0,
  instantEntry = false,
}: {
  shot: ScreenshotCardData;
  index?: number;
  // True for cards loaded via infinite scroll. Skips the videoCardFadeIn
  // cascade — see GifCard for the original rationale.
  instantEntry?: boolean;
}) {
  const t = useT();
  const href = `/screenshots/${shot.id}`;
  return (
    <div
      className="video-card"
      // See GifCard for rationale — paired with a CSS rule that resets
      // the videoCardFadeIn cascade for infinite-loaded cards.
      data-instant-entry={instantEntry ? "1" : undefined}
      style={{ ["--card-index" as string]: index }}
    >
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <Link
          href={href}
          aria-label={shot.title}
          style={{ display: "block" }}
        >
          <div
            className="thumb-aspect"
            style={shot.url ? undefined : { background: "black" }}
          >
            {shot.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.url} alt={shot.title} loading="lazy" />
            ) : (
              <Flex align="center" justify="center" style={{ height: "100%" }}>
                <Text color="gray" size="2">
                  —
                </Text>
              </Flex>
            )}
          </div>
        </Link>
        <Box p="3">
          <Flex align="center" gap="2" mb="1">
            <Text
              as="div"
              size="3"
              weight="medium"
              truncate
              style={{ flex: 1, minWidth: 0 }}
            >
              {shot.title}
            </Text>
            {shot.visibility === "private" && (
              <Badge variant="soft" color="gray" size="1">
                {t("screenshots.card.private")}
              </Badge>
            )}
          </Flex>
          {shot.owner?.name && (
            <Text as="div" size="2" color="gray" mb="1">
              {shot.owner.username ? (
                <Link
                  href={`/@${shot.owner.username}`}
                  style={{
                    color: "var(--gray-12)",
                    textDecoration: "none",
                  }}
                >
                  {shot.owner.name}
                </Link>
              ) : (
                shot.owner.name
              )}
            </Text>
          )}
          <Flex align="center" justify="between" gap="2">
            <Text as="div" size="1" color="gray">
              {shot.width && shot.height
                ? `${shot.width} × ${shot.height}`
                : ""}
            </Text>
            {shot.url && (
              <Button asChild size="1" variant="soft" color="iris">
                <a
                  href={shot.url}
                  download={`${shot.title}.png`}
                  // S3 sets Content-Disposition via the presigned URL? It
                  // doesn't here, but `download` on a same-origin <a> still
                  // triggers a save dialog in every modern browser.
                  rel="noopener noreferrer"
                >
                  <DownloadIcon />
                  {t("screenshots.card.download")}
                </a>
              </Button>
            )}
          </Flex>
        </Box>
      </Card>
    </div>
  );
}
