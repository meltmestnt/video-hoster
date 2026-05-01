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
}

export function ScreenshotCard({
  shot,
  index = 0,
}: {
  shot: ScreenshotCardData;
  index?: number;
}) {
  const t = useT();
  const href = `/screenshots/${shot.id}`;
  return (
    <div
      className="video-card"
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
