"use client";

import { useRef, useState } from "react";
import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  IconButton,
  Text,
  TextField,
} from "@radix-ui/themes";
import { TrashIcon } from "@radix-ui/react-icons";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_MB,
  type AllowedAudioMimeType,
} from "@repo/shared";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import {
  formatDuration,
  isAllowedAudioMime,
  probeAudioDuration,
} from "@/lib/audio-helpers";

type AudioList = inferRouterOutputs<AppRouter>["audio"]["listMine"];

interface Props {
  initial: AudioList;
}

export function AudioLibrary({ initial }: Props) {
  const utils = trpc.useUtils();
  const t = useT();
  const list = trpc.audio.listMine.useQuery(undefined, {
    initialData: initial,
    staleTime: 5_000,
  });

  const [title, setTitle] = useState("");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const createUpload = trpc.audio.createUpload.useMutation();
  const finalizeUpload = trpc.audio.finalizeUpload.useMutation();
  const deleteTemplate = trpc.audio.delete.useMutation({
    onSuccess: () => utils.audio.listMine.invalidate(),
  });

  const handlePickFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setPickedFile(null);
      return;
    }
    if (!isAllowedAudioMime(f.type)) {
      setError(
        t("audio.lib.add.errorType", { type: f.type || "unknown" }),
      );
      return;
    }
    if (f.size > MAX_AUDIO_BYTES) {
      setError(
        t("audio.lib.add.errorSize", {
          actual: (f.size / 1024 ** 2).toFixed(1),
          max: MAX_AUDIO_MB,
        }),
      );
      return;
    }
    setPickedFile(f);
    if (!title) {
      const stem = f.name.replace(/\.[^.]+$/, "").trim();
      if (stem) setTitle(stem.slice(0, 120));
    }
  };

  const upload = async () => {
    if (!pickedFile) return;
    if (!title.trim()) {
      setError(t("audio.lib.add.errorMissingTitle"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const duration = await probeAudioDuration(pickedFile);
      const created = await createUpload.mutateAsync({
        title: title.trim(),
        mimeType: pickedFile.type as AllowedAudioMimeType,
        sizeBytes: pickedFile.size,
        durationSeconds: duration ?? undefined,
      });
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": pickedFile.type },
        body: pickedFile,
      });
      if (!putRes.ok) throw new Error(`S3 PUT failed: ${putRes.status}`);
      await finalizeUpload.mutateAsync({
        audioTemplateId: created.audioTemplateId,
      });
      await utils.audio.listMine.invalidate();
      setTitle("");
      setPickedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const items = list.data ?? [];

  return (
    <Flex direction="column" gap="4">
      <Card>
        <Flex direction="column" gap="2" p="3">
          <Text size="3" weight="medium">
            {t("audio.lib.add.title")}
          </Text>
          <Flex gap="2" align="end" wrap="wrap">
            <Box style={{ flex: 1, minWidth: 200 }}>
              <Text size="1" color="gray" as="div" mb="1">
                {t("audio.lib.add.titleField")}
              </Text>
              <TextField.Root
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("audio.lib.add.titlePlaceholder")}
                maxLength={120}
                disabled={busy}
              />
            </Box>
            <Box style={{ flex: 1, minWidth: 200 }}>
              <Text size="1" color="gray" as="div" mb="1">
                {t("audio.lib.add.fileLabel", { mb: MAX_AUDIO_MB })}
              </Text>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_AUDIO_MIME_TYPES.join(",")}
                onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </Box>
            <Button
              size="2"
              onClick={upload}
              disabled={busy || !pickedFile || !title.trim()}
            >
              {busy ? t("audio.lib.add.uploading") : t("audio.lib.add.upload")}
            </Button>
          </Flex>
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
      </Card>

      {items.length === 0 ? (
        <Text size="2" color="gray">
          {t("audio.lib.empty")}
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {items.map((tpl) => (
            <Card key={tpl.id}>
              <Flex align="center" gap="3" p="3">
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text as="div" size="3" weight="medium" truncate>
                    {tpl.title}
                  </Text>
                  <Text as="div" size="1" color="gray">
                    {formatDuration(tpl.durationSeconds)} ·{" "}
                    {tpl.sizeBytes
                      ? `${(tpl.sizeBytes / 1024 ** 2).toFixed(2)} MB`
                      : ""}
                  </Text>
                </Box>
                {tpl.url && (
                  <audio controls preload="none" src={tpl.url} />
                )}
                <IconButton
                  variant="soft"
                  color="red"
                  onClick={() => deleteTemplate.mutate({ id: tpl.id })}
                  disabled={deleteTemplate.isPending}
                  aria-label={t("audio.lib.delete")}
                >
                  <TrashIcon />
                </IconButton>
              </Flex>
            </Card>
          ))}
        </Flex>
      )}
    </Flex>
  );
}
