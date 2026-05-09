"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Box, Card, Flex, IconButton, Text } from "@radix-ui/themes";
import { BookmarkIcon } from "@radix-ui/react-icons";
import { useSession } from "next-auth/react";
import { morphToPlayer } from "@/lib/morph-to-player";
import { useT } from "@/lib/i18n";
import { AddToFolderMenu } from "./AddToFolderMenu";

interface GifCardData {
  id: string;
  title: string;
  gifUrl: string | null;
  visibility: "public" | "private";
  source?: "web" | "telegram";
  owner: { name: string; username?: string | null; avatarUrl: string | null };
  tags: { id: string; name: string }[];
}

export function GifCard({
  gif,
  index = 0,
  revealMedia = true,
  onMediaReady,
}: {
  gif: GifCardData;
  index?: number;
  // When false, the image element stays hidden behind the spinner even
  // after its first frame has decoded. The infinite list uses this to
  // batch-reveal a newly-loaded page so cards don't pop in at staggered
  // times based purely on per-GIF file size and network variance.
  revealMedia?: boolean;
  onMediaReady?: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const href = `/gifs/${gif.id}`;
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Browsers progressively decode GIFs: the first frame becomes visible long
  // before the full file lands, and naturalWidth flips to non-zero at that
  // moment. We use it to drop the spinner as soon as we have anything to
  // show — the still first frame acts as a thumbnail until the rest of the
  // bytes arrive and the browser starts animating.
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  // Latest callback in a ref so the polling effect doesn't restart whenever
  // the parent re-renders with a new closure.
  const onMediaReadyRef = useRef(onMediaReady);
  onMediaReadyRef.current = onMediaReady;
  const reportedReadyRef = useRef(false);

  // No router.prefetch here on purpose. App Router's prefetch caches the
  // RSC payload; if a prefetch ever lands during a transient bad-auth or
  // a server error, Next.js will replay that 404/error on the click that
  // follows — even though a fresh full page-load of the same URL works
  // fine. The morph animation already gives the click instant feedback,
  // so we trade a sub-100ms theoretical speedup for navigation that is
  // never poisoned by a stale prefetch.

  useEffect(() => {
    setHasFirstFrame(false);
    reportedReadyRef.current = false;
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

  useEffect(() => {
    if (!hasFirstFrame || reportedReadyRef.current) return;
    reportedReadyRef.current = true;
    onMediaReadyRef.current?.();
  }, [hasFirstFrame]);

  const navigate = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.button === 1) return;
    // Block clicks while a morph is already in flight so spamming cards
    // doesn't queue up a stack of navigations / overlays.
    if (document.body.dataset.morphing) {
      e.preventDefault();
      return;
    }
    // Anon viewers are welcome on /gifs/[id] — the detail page renders
    // for them and the API enforces its own daily-views cap.
    const thumb = thumbRef.current;
    if (!thumb) return; // let the <a> navigate normally
    e.preventDefault();
    // Hold for 100ms so the click registers as a deliberate action
    // before the morph + scroll snap fire. preventDefault has already
    // run synchronously, so the browser won't follow the <a> in the
    // meantime.
    window.setTimeout(() => {
      // Snap the listing to the top before measuring/morphing so the
      // destination page lands at scrollY=0 and the overlay's document-
      // anchored math lines up with where the destination .player-frame
      // will actually render. Without this, a click made deep in the
      // list morphs to a point far below where Next.js then scroll-
      // resets to.
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      // Push the route from inside onMorphStart so the destination page
      // begins streaming as the overlay starts moving — same staging
      // VideoCard uses.
      const ok = morphToPlayer({
        thumbEl: thumb,
        imageUrl: gif.gifUrl,
        // Black letterboxing matches the destination .player-frame so
        // the bars that contain-mode produces don't change color when
        // the overlay fades out into the actual page.
        backgroundColor: "black",
        // Contain throughout — the source GIF is rarely 16:9, so cover
        // would crop the thumbnail's edges and stretch them visibly as
        // the overlay's aspect ratio shifts during morph.
        objectFit: "contain",
        onMorphStart: () => router.push(href),
      });
      if (!ok) router.push(href);
    }, 100);
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
                  opacity: hasFirstFrame && revealMedia ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              />
              {(!hasFirstFrame || !revealMedia) && (
                <div className="media-loader" aria-hidden />
              )}
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
              {signedIn && (
                <div
                  // preventDefault on the wrapper kills the surrounding
                  // <a>'s native navigation; stopPropagation in BUBBLE
                  // (not capture) keeps the navigate onClick from firing
                  // while still letting Radix's trigger receive the click
                  // on its way down. mousedown is what kicks off the
                  // morph helper's measurement, so we gate that too.
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 2,
                  }}
                >
                  <AddToFolderMenu
                    gifId={gif.id}
                    align="end"
                  >
                    <IconButton
                      size="1"
                      variant="solid"
                      color="gray"
                      highContrast
                      aria-label={t("gifCard.menu.addToFolder")}
                      title={t("gifCard.menu.addToFolder")}
                      style={{ opacity: 0.92 }}
                    >
                      <BookmarkIcon />
                    </IconButton>
                  </AddToFolderMenu>
                </div>
              )}
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
            {gif.source === "telegram" && (
              <Badge variant="soft" color="sky" size="1">
                {t("card.viaTelegram")}
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
