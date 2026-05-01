"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Box, Card, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";

interface Item {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  owner: { name: string };
}

function SuggestedThumb({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
      {!loaded && <div className="media-loader" aria-hidden />}
    </>
  );
}

export function SuggestedList({ items }: { items: Item[] }) {
  const t = useT();
  if (items.length === 0) {
    return (
      <Text size="2" color="gray">
        {t("suggested.empty")}
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="2">
      {items.map((it) => (
        <Link key={it.id} href={`/videos/${it.id}`}>
          <Card style={{ padding: 8 }}>
            <Flex gap="3" align="center">
              <Box
                style={{
                  position: "relative",
                  width: 120,
                  aspectRatio: "16 / 9",
                  flexShrink: 0,
                  borderRadius: "var(--radius-2)",
                  overflow: "hidden",
                  background: "var(--gray-3)",
                }}
              >
                {it.thumbnailUrl && (
                  <SuggestedThumb src={it.thumbnailUrl} alt={it.title} />
                )}
              </Box>
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Text as="div" size="2" weight="medium" truncate>
                  {it.title}
                </Text>
                <Text as="div" size="1" color="gray">
                  {it.owner.name}
                </Text>
              </Box>
            </Flex>
          </Card>
        </Link>
      ))}
    </Flex>
  );
}
