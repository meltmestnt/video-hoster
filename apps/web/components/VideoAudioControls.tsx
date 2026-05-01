"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  Flex,
  IconButton,
  Select,
  Slider,
  Switch,
  Text,
} from "@radix-ui/themes";
import { TrashIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { formatDuration } from "@/lib/audio-helpers";
import { useT } from "@/lib/i18n";

interface VideoAudioTrack {
  id: string;
  startSeconds: number;
  volume: number;
  audioTemplate: {
    id: string;
    title: string;
    durationSeconds: number | null;
  };
}

interface Props {
  videoId: string;
  initialMainMuted: boolean;
  initialTracks: VideoAudioTrack[];
}

/**
 * Owner-only mixing panel under the player. Lets the owner mute the
 * original audio of the video and add/remove/tune overlay tracks. All
 * mutations invalidate `videos.byId` so the player resyncs.
 */
export function VideoAudioControls({
  videoId,
  initialMainMuted,
  initialTracks,
}: Props) {
  const utils = trpc.useUtils();
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const myAudio = trpc.audio.listMine.useQuery(undefined, {
    enabled: !!me.data,
    staleTime: 10_000,
  });

  const [mainMuted, setMainMuted] = useState(initialMainMuted);
  const [tracks, setTracks] = useState(initialTracks);
  const [picked, setPicked] = useState<string | null>(null);

  const setMainMutedMut = trpc.audio.setMainMuted.useMutation({
    onMutate: ({ muted }) => {
      const prev = mainMuted;
      setMainMuted(muted);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) setMainMuted(ctx.prev);
    },
    onSettled: () => utils.videos.byId.invalidate({ id: videoId }),
  });

  const attach = trpc.audio.attach.useMutation({
    onSuccess: async () => {
      await utils.videos.byId.invalidate({ id: videoId });
    },
  });
  const detach = trpc.audio.detach.useMutation();
  const update = trpc.audio.update.useMutation();

  const usedIds = useMemo(
    () => new Set(tracks.map((t) => t.audioTemplate.id)),
    [tracks],
  );
  const availableTemplates = useMemo(
    () => (myAudio.data ?? []).filter((tpl) => !usedIds.has(tpl.id)),
    [myAudio.data, usedIds],
  );

  const onAttach = async () => {
    if (!picked) return;
    const tpl = (myAudio.data ?? []).find((t) => t.id === picked);
    if (!tpl) return;
    const created = await attach.mutateAsync({
      videoId,
      audioTemplateId: picked,
      startSeconds: 0,
      volume: 1,
    });
    setTracks((prev) => [
      ...prev,
      {
        id: created.id,
        startSeconds: created.startSeconds,
        volume: created.volume,
        audioTemplate: {
          id: tpl.id,
          title: tpl.title,
          durationSeconds: tpl.durationSeconds,
        },
      },
    ]);
    setPicked(null);
  };

  const onDetach = async (trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    try {
      await detach.mutateAsync({ trackId });
    } finally {
      utils.videos.byId.invalidate({ id: videoId });
    }
  };

  // Local optimistic updates for sliders so dragging stays smooth — the
  // server only hears about it when the value commits (onValueCommit).
  const onTrackVolumeChange = (trackId: string, value: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, volume: value } : t)),
    );
  };
  const onTrackVolumeCommit = (trackId: string, value: number) => {
    update.mutate(
      { trackId, volume: value },
      { onSettled: () => utils.videos.byId.invalidate({ id: videoId }) },
    );
  };
  const onTrackStartChange = (trackId: string, value: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, startSeconds: value } : t)),
    );
  };
  const onTrackStartCommit = (trackId: string, value: number) => {
    update.mutate(
      { trackId, startSeconds: value },
      { onSettled: () => utils.videos.byId.invalidate({ id: videoId }) },
    );
  };

  return (
    <Card my="5">
      <Flex direction="column" gap="4" p="4">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Box>
            <Text size="3" weight="medium" as="div">
              {t("audio.mix.heading")}
            </Text>
            <Text size="1" color="gray" as="div">
              {t("audio.mix.subtitle")}
            </Text>
          </Box>
          <Flex gap="2" align="center">
            <Text size="2">{t("audio.mix.muteOriginal")}</Text>
            <Switch
              checked={mainMuted}
              disabled={setMainMutedMut.isPending}
              onCheckedChange={(v) =>
                setMainMutedMut.mutate({ videoId, muted: v })
              }
            />
          </Flex>
        </Flex>

        <Flex gap="2" align="center" wrap="wrap">
          <Select.Root
            value={picked ?? ""}
            onValueChange={(v) => setPicked(v || null)}
          >
            <Select.Trigger
              placeholder={
                availableTemplates.length
                  ? t("audio.mix.pickTemplate")
                  : t("audio.mix.noMoreTemplates")
              }
              disabled={availableTemplates.length === 0}
            />
            <Select.Content>
              {availableTemplates.map((tpl) => (
                <Select.Item key={tpl.id} value={tpl.id}>
                  {tpl.title} · {formatDuration(tpl.durationSeconds)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button
            onClick={onAttach}
            disabled={!picked || attach.isPending}
            size="2"
          >
            {t("audio.mix.addOverlay")}
          </Button>
          <Button asChild variant="ghost" color="gray" size="2">
            <Link href="/audio">{t("audio.mix.manageLibrary")}</Link>
          </Button>
        </Flex>

        {tracks.length === 0 ? (
          <Text size="2" color="gray">
            {t("audio.mix.empty")}
          </Text>
        ) : (
          <Flex direction="column" gap="2">
            {tracks.map((track) => (
              <Box
                key={track.id}
                style={{
                  border: "1px solid var(--gray-4)",
                  borderRadius: "var(--radius-2)",
                  padding: 12,
                }}
              >
                <Flex align="center" gap="3" wrap="wrap">
                  <Box style={{ flex: 1, minWidth: 200 }}>
                    <Text size="2" weight="medium" as="div">
                      {track.audioTemplate.title}
                    </Text>
                    <Text size="1" color="gray" as="div">
                      {formatDuration(track.audioTemplate.durationSeconds)}
                    </Text>
                  </Box>
                  <IconButton
                    variant="soft"
                    color="red"
                    size="1"
                    onClick={() => onDetach(track.id)}
                    aria-label={t("audio.mix.removeOverlay")}
                  >
                    <TrashIcon />
                  </IconButton>
                </Flex>
                <Flex gap="3" mt="2" wrap="wrap" align="center">
                  <Box style={{ flex: 1, minWidth: 220 }}>
                    <Flex justify="between">
                      <Text size="1" color="gray">
                        {t("audio.mix.start")}
                      </Text>
                      <Text size="1" color="gray">
                        {track.startSeconds.toFixed(1)}s
                      </Text>
                    </Flex>
                    <Slider
                      size="1"
                      value={[Math.round(track.startSeconds * 10)]}
                      min={0}
                      max={6000}
                      step={1}
                      onValueChange={(v) =>
                        onTrackStartChange(track.id, (v[0] ?? 0) / 10)
                      }
                      onValueCommit={(v) =>
                        onTrackStartCommit(track.id, (v[0] ?? 0) / 10)
                      }
                    />
                  </Box>
                  <Box style={{ flex: 1, minWidth: 220 }}>
                    <Flex justify="between">
                      <Text size="1" color="gray">
                        {t("audio.mix.volume")}
                      </Text>
                      <Text size="1" color="gray">
                        {Math.round(track.volume * 100)}%
                      </Text>
                    </Flex>
                    <Slider
                      size="1"
                      value={[Math.round(track.volume * 100)]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) =>
                        onTrackVolumeChange(track.id, (v[0] ?? 0) / 100)
                      }
                      onValueCommit={(v) =>
                        onTrackVolumeCommit(track.id, (v[0] ?? 0) / 100)
                      }
                    />
                  </Box>
                </Flex>
              </Box>
            ))}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
