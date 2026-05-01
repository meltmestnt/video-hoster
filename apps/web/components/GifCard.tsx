"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const href = `/gifs/${gif.id}`;
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Browsers progressively decode GIFs: the first frame becomes visible long
  // before the full file lands, and naturalWidth flips to non-zero at that
  // moment. We use it to drop the spinner as soon as we have anything to
  // show — the still first frame acts as a thumbnail until the rest of the
  // bytes arrive and the browser starts animating.
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  useEffect(() => {
    setHasFirstFrame(false);
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setHasFirstFrame(true);
      return;
    }
    let raf = 0;
    const tick = () => {
      const live = imgRef.current;
      if (live && live.naturalWidth > 0) {
        setHasFirstFrame(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
                decoding="async"
                onLoad={() => setHasFirstFrame(true)}
                onError={() => setHasFirstFrame(true)}
                style={{
                  opacity: hasFirstFrame ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              />
              {!hasFirstFrame && <div className="media-loader" aria-hidden />}
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
                {t("card.noPreview")}
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
                {t("card.private")}
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
