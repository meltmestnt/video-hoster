"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cross2Icon,
  PauseIcon,
  PlayIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { AlertDialog, Button, Flex, Text } from "@radix-ui/themes";
import type ReactPlayerType from "react-player";
import { useMiniPlayer } from "@/lib/mini-player-context";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface Props {
  /**
   * SSR-resolved value of the user's miniPlayerEnabled preference,
   * forwarded from the (app) layout's auth.me query. Without this the
   * gate only ran after the client-side trpc query resolved, so users
   * who had disabled the mini player would still see it flash for the
   * first few hundred ms after navigating away from a video page.
   */
  initialEnabled?: boolean;
}

export function MiniPlayer({ initialEnabled = true }: Props = {}) {
  const mini = useMiniPlayer();
  const pathname = usePathname();
  const playerRef = useRef<ReactPlayerType | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const t = useT();

  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const setPref = trpc.users.setMiniPlayerPreference.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  // When the active video changes, we need to re-seed the seek on ready.
  useEffect(() => {
    setSeeded(false);
  }, [mini.video?.id]);

  if (!mini.video) return null;
  if (pathname === `/videos/${mini.video.id}`) return null;
  // Respect a user's persisted "always hide" preference. Prefer the
  // live query result when it's resolved; otherwise fall back to the
  // SSR-provided value so the mini player never flashes on against
  // someone who has explicitly disabled it.
  const enabled = me.data?.miniPlayerEnabled ?? initialEnabled;
  if (!enabled) return null;

  const handleClose = () => {
    if (me.data && !me.data.miniPlayerPromptSeen) {
      setPromptOpen(true);
      return;
    }
    mini.close();
  };

  const dismissOnce = async () => {
    if (me.data) {
      await setPref.mutateAsync({ enabled: true });
    }
    setPromptOpen(false);
    mini.close();
  };

  const alwaysHide = async () => {
    if (me.data) {
      await setPref.mutateAsync({ enabled: false });
    }
    setPromptOpen(false);
    mini.close();
  };

  const handleReady = () => {
    if (!seeded && mini.currentTime > 0) {
      playerRef.current?.seekTo(mini.currentTime, "seconds");
    }
    setSeeded(true);
  };

  return (
    <div className="mini-player" role="complementary" aria-label={t("mini.aria.label")}>
      <div className="mini-player-frame">
        <ReactPlayer
          ref={(r: ReactPlayerType | null) => {
            playerRef.current = r;
          }}
          url={mini.video.url}
          playing={mini.playing}
          volume={mini.volume}
          muted={mini.muted}
          width="100%"
          height="100%"
          controls={false}
          onReady={handleReady}
          onPlay={() => mini.update({ playing: true })}
          onPause={() => mini.update({ playing: false })}
          onEnded={() => mini.update({ playing: false })}
          onProgress={(s) => {
            if (Number.isFinite(s.playedSeconds)) {
              mini.update({ currentTime: s.playedSeconds });
            }
          }}
          config={{
            file: {
              attributes: mini.video.thumbnailUrl
                ? { poster: mini.video.thumbnailUrl }
                : {},
            },
          }}
        />
        <Link
          href={`/videos/${mini.video.id}`}
          className="mini-player-cover"
          aria-label={t("mini.aria.open", { title: mini.video.title })}
        />
      </div>
      <div className="mini-player-controls">
        <button
          type="button"
          className="mini-player-btn"
          onClick={() => mini.update({ playing: !mini.playing })}
          aria-label={mini.playing ? t("player.aria.pause") : t("player.aria.play")}
        >
          {mini.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="mini-player-btn"
          onClick={() => mini.update({ muted: !mini.muted })}
          aria-label={mini.muted ? t("player.aria.unmute") : t("player.aria.mute")}
        >
          {mini.muted ? <SpeakerOffIcon /> : <SpeakerLoudIcon />}
        </button>
        <Link
          href={`/videos/${mini.video.id}`}
          className="mini-player-title"
          title={mini.video.title}
        >
          {mini.video.title}
        </Link>
        <button
          type="button"
          className="mini-player-btn"
          onClick={handleClose}
          aria-label={t("mini.aria.close")}
        >
          <Cross2Icon />
        </button>
      </div>

      <AlertDialog.Root open={promptOpen} onOpenChange={setPromptOpen}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>{t("mini.prompt.title")}</AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Text as="p">{t("mini.prompt.body")}</Text>
            <Text as="p" mt="2">
              {t("mini.prompt.q")}
            </Text>
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end" wrap="wrap">
            <Button
              variant="soft"
              color="gray"
              onClick={dismissOnce}
              disabled={setPref.isPending}
            >
              {t("mini.prompt.justOnce")}
            </Button>
            <Button
              color="red"
              onClick={alwaysHide}
              disabled={setPref.isPending}
            >
              {t("mini.prompt.alwaysHide")}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}
