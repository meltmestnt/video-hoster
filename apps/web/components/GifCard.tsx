"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";

interface GifCardData {
  id: string;
  title: string;
  gifUrl: string | null;
  visibility: "public" | "private";
  owner: { name: string; avatarUrl: string | null };
  tags: { id: string; name: string }[];
}

export function GifCard({
  gif,
  index = 0,
}: {
  gif: GifCardData;
  index?: number;
}) {
  const router = useRouter();
  const href = `/gifs/${gif.id}`;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
  }, [gif.gifUrl]);

  return (
    <a
      href={href}
      className="video-card"
      aria-label={gif.title}
      style={{ ["--card-index" as string]: index }}
    >
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <div
          className="thumb-aspect"
          style={gif.gifUrl ? undefined : { background: "black" }}
        >
          {gif.gifUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={gif.gifUrl}
                alt={gif.title}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setLoaded(true)}
                style={{
                  opacity: loaded ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              />
              {!loaded && <div className="media-loader" aria-hidden />}
              <Badge
                variant="solid"
                color="iris"
                size="1"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 1,
                }}
              >
                GIF
              </Badge>
            </>
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray" size="2">
                No preview
              </Text>
            </Flex>
          )}
        </div>
        <Box p="3">
          <Flex align="center" gap="2" mb="1">
            <Text
              as="div"
              size="3"
              weight="medium"
              truncate
              style={{ flex: 1, minWidth: 0 }}
            >
              {gif.title}
            </Text>
            {gif.visibility === "private" && (
              <Badge variant="soft" color="gray" size="1">
                Private
              </Badge>
            )}
          </Flex>
          <Text as="div" size="2" color="gray" mb="2">
            {gif.owner.name}
          </Text>
          {gif.tags.length > 0 && (
            <Flex gap="1" wrap="wrap">
              {gif.tags.slice(0, 4).map((t) => (
                <Badge key={t.id} variant="soft" color="iris" size="1">
                  {t.name}
                </Badge>
              ))}
            </Flex>
          )}
        </Box>
      </Card>
    </a>
  );
}
