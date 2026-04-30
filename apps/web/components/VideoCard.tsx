"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";
import { useRequireAuth } from "@/lib/auth-required";

interface VideoCardData {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  visibility: "public" | "private";
  owner: { name: string; avatarUrl: string | null };
  tags: { id: string; name: string }[];
}

const PREVIEW_DELAY_MS = 1000;

const MORPH_MS = 300;
const MORPH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const MORPH_DEST_NUDGE_X = 0;
const MORPH_DEST_NUDGE_Y = 0;

function computePlayerRect() {
  const inner = document.querySelector(".rt-ContainerInner") as HTMLElement | null;
  if (!inner) return null;

  // Probe lives inside .rt-ContainerInner so it gets the exact same width
  // and CSS context that .video-page does on the destination page.
  // Measuring col1 directly bypasses any flakiness around aspect-ratio sizing
  // and gives us the live 1fr column width the real player will receive.
  const probe = document.createElement("div");
  probe.className = "video-page";
  probe.style.cssText =
    "position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none";
  const col1 = document.createElement("div");
  col1.style.minHeight = "1px";
  const col2 = document.createElement("div");
  col2.style.minHeight = "1px";
  probe.appendChild(col1);
  probe.appendChild(col2);

  const innerComputed = getComputedStyle(inner);
  const wasStatic = innerComputed.position === "static";
  const previousPosition = inner.style.position;
  if (wasStatic) inner.style.position = "relative";

  inner.appendChild(probe);
  const innerRect = inner.getBoundingClientRect();
  const probeRect = probe.getBoundingClientRect();
  const col1Rect = col1.getBoundingClientRect();
  const leftOffset = col1Rect.left - probeRect.left;
  inner.removeChild(probe);

  if (wasStatic) inner.style.position = previousPosition;

  // The actual player's footprint (no overshoot)
  const playerWidth = col1Rect.width;
  const playerHeight = (playerWidth * 9) / 16;
  const playerTop = innerRect.top;
  const playerLeft = innerRect.left + leftOffset;

  // Overshoot the morph by 0px wide, centered on the player so the
  // expansion grows equally on every side from the player's center.
  const width = playerWidth + 0;
  const height = (width * 9) / 16;
  return {
    top: playerTop - (height - playerHeight) / 2,
    left: playerLeft - (width - playerWidth) / 2,
    width,
    height,
  };
}

export function VideoCard({
  video,
  index = 0,
}: {
  video: VideoCardData;
  index?: number;
}) {
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const href = `/videos/${video.id}`;
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  useEffect(
    () => () => {
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
      }
    },
    [],
  );

  const cancelPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewing(false);
  };

  const onMouseEnter = () => {
    if (!video.videoUrl) return;
    if (document.body.dataset.morphing) return;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewing(true);
    }, PREVIEW_DELAY_MS);
  };

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setThumbLoaded(true);
    }
  }, [video.thumbnailUrl]);

  const navigate = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    if (!requireAuth()) {
      e.preventDefault();
      return;
    }
    const thumb = thumbRef.current;
    const dest = thumb ? computePlayerRect() : null;
    if (!thumb || !dest) return; // let the <a> navigate normally

    e.preventDefault();
    const src = thumb.getBoundingClientRect();
    // Anchor the overlay in page coordinates (not viewport) so the scroll
    // reset that Next.js performs on navigation doesn't dislocate it from
    // where the destination .player-frame will land on the new page.
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const overlay = document.createElement("div");
    const overlayBg = video.thumbnailUrl ? "var(--gray-3)" : "black";
    overlay.style.cssText = [
      "position:absolute",
      `top:${src.top + scrollY}px`,
      `left:${src.left + scrollX}px`,
      `width:${src.width}px`,
      `height:${src.height}px`,
      "z-index:9999",
      // start as a circle/ellipse — expands outward from this rounded shape
      "border-radius:50%",
      "overflow:hidden",
      `background:${overlayBg}`,
      "transform-origin:center center",
      "pointer-events:none",
      "will-change:transform,border-radius",
      `transition:transform ${MORPH_MS}ms ${MORPH_EASING},border-radius ${MORPH_MS}ms ${MORPH_EASING}`,
    ].join(";");

    if (video.thumbnailUrl) {
      const img = document.createElement("img");
      img.src = video.thumbnailUrl;
      img.style.cssText =
        "width:100%;height:100%;object-fit:cover;display:block";
      overlay.appendChild(img);
    }

    document.body.appendChild(overlay);
    document.body.dataset.morphing = "1";
    thumb.style.opacity = "0";

    // force a reflow so the initial styles commit before transitioning
    void overlay.offsetWidth;

    const srcCenterX = src.left + src.width / 2;
    const srcCenterY = src.top + src.height / 2;
    const destCenterX = dest.left + dest.width / 2 + MORPH_DEST_NUDGE_X;
    const destCenterY = dest.top + dest.height / 2 + MORPH_DEST_NUDGE_Y;
    const tx = destCenterX - srcCenterX;
    const ty = destCenterY - srcCenterY;
    const sx = dest.width / src.width;
    const sy = dest.height / src.height;
    overlay.style.transform = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
    overlay.style.borderRadius = "var(--radius-3)";

    // Kick off navigation immediately; the overlay rides on top of whatever
    // the destination page renders.
    router.push(href);

    // Hold the overlay (and the page-header fade) in place until BOTH the
    // morph animation has finished AND the destination page has actually
    // mounted. The destination video page renders <MorphLandingSignal />
    // which fires "videoplayer:morph:landed" on mount. If the page render
    // is slow, this prevents the source page (title/grid) from briefly
    // reappearing under the overlay while we wait.
    const SAFETY_MS = 6000;
    let morphDone = false;
    let destLanded = false;
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      overlay.style.transition = "opacity 120ms ease";
      overlay.style.opacity = "0";
      window.setTimeout(() => {
        overlay.remove();
        delete document.body.dataset.morphing;
      }, 140);
    };

    const tryCleanup = () => {
      if (morphDone && destLanded) cleanup();
    };

    const onLanded = () => {
      destLanded = true;
      tryCleanup();
    };
    window.addEventListener("videoplayer:morph:landed", onLanded, {
      once: true,
    });

    window.setTimeout(() => {
      morphDone = true;
      tryCleanup();
    }, MORPH_MS + 60);

    // Safety net: if the destination never mounts (404, network failure,
    // etc.), don't strand the overlay on screen forever.
    window.setTimeout(() => {
      window.removeEventListener("videoplayer:morph:landed", onLanded);
      destLanded = true;
      morphDone = true;
      tryCleanup();
    }, SAFETY_MS);
  };

  return (
    <a
      href={href}
      onClick={navigate}
      onMouseEnter={onMouseEnter}
      onMouseLeave={cancelPreview}
      className="video-card"
      aria-label={video.title}
      style={{ ["--card-index" as string]: index }}
    >
      <Card style={{ overflow: "hidden", padding: 0 }}>
        <div
          ref={thumbRef}
          className="thumb-aspect"
          style={video.thumbnailUrl ? undefined : { background: "black" }}
        >
          {video.thumbnailUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={video.thumbnailUrl}
                alt={video.title}
                loading="lazy"
                onLoad={() => setThumbLoaded(true)}
                onError={() => setThumbLoaded(true)}
                style={{
                  opacity: thumbLoaded ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              />
              {!thumbLoaded && <div className="media-loader" aria-hidden />}
            </>
          ) : (
            <Flex align="center" justify="center" style={{ height: "100%" }}>
              <Text color="gray" size="2">
                No thumbnail
              </Text>
            </Flex>
          )}
          {previewing && video.videoUrl && (
            <video
              src={video.videoUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              style={{
                position: "absolute",
                inset: 0,
                opacity: 1,
                animation: "previewFadeIn 200ms ease forwards",
              }}
            />
          )}
        </div>
        <Box p="3">
          <Flex align="center" gap="2" mb="1">
            <Text as="div" size="3" weight="medium" truncate style={{ flex: 1, minWidth: 0 }}>
              {video.title}
            </Text>
            {video.visibility === "private" && (
              <Badge variant="soft" color="gray" size="1">
                Private
              </Badge>
            )}
          </Flex>
          <Text as="div" size="2" color="gray" mb="2">
            {video.owner.name}
          </Text>
          {video.tags.length > 0 && (
            <Flex gap="1" wrap="wrap">
              {video.tags.slice(0, 4).map((t) => (
                <Badge key={t.id} asChild variant="soft" color="iris" size="1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!requireAuth()) return;
                      router.push(
                        `/search?tag=${encodeURIComponent(t.name)}`,
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!requireAuth()) return;
                        router.push(
                          `/search?tag=${encodeURIComponent(t.name)}`,
                        );
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {t.name}
                  </span>
                </Badge>
              ))}
            </Flex>
          )}
        </Box>
      </Card>
    </a>
  );
}
