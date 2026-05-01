"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";
import { morphToPlayer } from "@/lib/morph-to-player";
import { useT } from "@/lib/i18n";

interface GifCardData {
  id: string;
  title: string;
  gifUrl: string | null;
  visibility: "public" | "private";
  owner: { name: string; username?: string | null; avatarUrl: string | null };
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
  const thumbRef = useRef<HTMLDivElement | null>(null);
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

  const navigate = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    // Anon viewers are welcome on /gifs/[id] — the detail page renders
    // for them and the API enforces its own daily-views cap.
    const thumb = thumbRef.current;
    if (!thumb) return; // let the <a> navigate normally
    e.preventDefault();
    // Push the route from inside onMorphStart so the destination page
    // begins streaming as the overlay starts moving — same staging
    // VideoCard uses.
    const ok = morphToPlayer({
      thumbEl: thumb,
      imageUrl: gif.gifUrl,
      backgroundColor: gif.gifUrl ? "var(--gray-3)" : "black",
      // The destination GIF page renders the image with object-fit:contain,
      // so the overlay should land in "contain" mode too. Source thumb is
      // "cover", but the helper's overlay is square-ish during transit and
      // "cover" reads better mid-flight; the brief mismatch on land is
      // hidden when the overlay fades out.
      objectFit: "cover",
      onMorphStart: () => router.push(href),
    });
    if (!ok) router.push(href);
  };

  return (
    <a
      href={href}
      onClick={navigate}
      className="video-card"
      aria-label={gif.title}
      style={{ ["--card-index" as string]: index }}
    >
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <div
          ref={thumbRef}
          className="thumb-aspect"
          style={gif.gifUrl ? undefined : { background: "black" }}
        >
          {gif.gifUrl ? (
            <>
              {/* GIF stays animated for everyone — the file is fetched
                  from S3 the moment the card mounts, so freezing the
                  animation client-side doesn't save bandwidth. The 15
                  videos+gifs daily cap still gates clicks into the
                  detail page for anon viewers. */}
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
            {gif.owner.username ? (
              <span
                role="button"
                tabIndex={0}
                // Card is wrapped in an outer <a> — span+stopPropagation
                // is the only way to nest a clickable region without
                // emitting invalid nested anchor markup.
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/@${gif.owner.username}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/@${gif.owner.username}`);
                  }
                }}
                style={{ cursor: "pointer", color: "var(--gray-12)" }}
              >
                {gif.owner.name}
              </span>
            ) : (
              gif.owner.name
            )}
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
