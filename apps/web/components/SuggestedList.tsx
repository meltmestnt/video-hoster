"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Box, Card, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";
import { morphToPlayer } from "@/lib/morph-to-player";

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
        <SuggestedRow key={it.id} item={it} />
      ))}
    </Flex>
  );
}

function SuggestedRow({ item }: { item: Item }) {
  const router = useRouter();
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const href = `/videos/${item.id}`;

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  const navigate = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    const thumb = thumbRef.current;
    if (!thumb) return;
    e.preventDefault();
    const ok = morphToPlayer({
      thumbEl: thumb,
      imageUrl: item.thumbnailUrl,
      backgroundColor: item.thumbnailUrl ? "var(--gray-3)" : "black",
      objectFit: "cover",
      onMorphStart: () => router.push(href),
    });
    if (!ok) router.push(href);
  };

  return (
    <a
      href={href}
      onClick={navigate}
      style={{ color: "inherit", textDecoration: "none" }}
      aria-label={item.title}
    >
      <Card style={{ padding: 8 }}>
        <Flex gap="3" align="center">
          <Box
            ref={thumbRef}
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
            {item.thumbnailUrl && (
              <SuggestedThumb src={item.thumbnailUrl} alt={item.title} />
            )}
          </Box>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text as="div" size="2" weight="medium" truncate>
              {item.title}
            </Text>
            <Text as="div" size="1" color="gray">
              {item.owner.name}
            </Text>
          </Box>
        </Flex>
      </Card>
    </a>
  );
}
