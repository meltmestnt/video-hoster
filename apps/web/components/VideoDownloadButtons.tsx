"use client";

import { useState } from "react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { DownloadIcon } from "@radix-ui/react-icons";
import { extract } from "@/lib/compress-video";
import { useT } from "@/lib/i18n";
import { useVerifyRequired } from "@/components/VerifyRequiredDialog";

interface Props {
  videoUrl: string;
  videoMimeType: string;
  baseFilename: string;
  policy: "full" | "audio" | "none";
  verified: boolean;
}

const extensionForMime = (mime: string): string => {
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  if (mime === "video/x-matroska") return "mkv";
  return "mp4";
};

const triggerDownload = (blob: Blob, filename: string) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 5_000);
};

export function VideoDownloadButtons({
  videoUrl,
  videoMimeType,
  baseFilename,
  policy,
  verified,
}: Props) {
  const t = useT();
  const verifyRequired = useVerifyRequired();
  const [busy, setBusy] = useState<null | "video" | "audio">(null);
  const [error, setError] = useState<string | null>(null);

  if (policy === "none") return null;

  const slug = baseFilename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video";

  const downloadVideo = async () => {
    // Downloads are gated to verified accounts — UnverifiedBanner promises
    // this in copy, and the rest of the app (Convert, uploads, reactions,
    // etc.) already enforces it. Same dialog/kind as the convert gate.
    if (!verified) {
      verifyRequired.show("action", "unverified");
      return;
    }
    setError(null);
    setBusy("video");
    try {
      // Fetch the presigned S3 URL into a Blob so we can force a save dialog
      // regardless of how the bucket spells Content-Disposition.
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerDownload(blob, `${slug}.${extensionForMime(videoMimeType)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const downloadAudio = async () => {
    if (!verified) {
      verifyRequired.show("action", "unverified");
      return;
    }
    setError(null);
    setBusy("audio");
    try {
      // Pull the video locally, then re-encode just the audio as MP3 in the
      // browser. Avoids a server-side ffmpeg path and works for any bucket.
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], `${slug}.mp4`, { type: videoMimeType });
      const audioBlob = await extract("audio", file);
      triggerDownload(audioBlob, `${slug}.mp3`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <Flex align="center" gap="2" wrap="wrap">
        {policy === "full" && (
          <Button
            variant="soft"
            color="iris"
            onClick={downloadVideo}
            disabled={busy !== null}
          >
            <DownloadIcon />
            {busy === "video"
              ? t("video.download.preparingVideo")
              : t("video.download.video")}
          </Button>
        )}
        {(policy === "full" || policy === "audio") && (
          <Button
            variant="soft"
            color="gray"
            onClick={downloadAudio}
            disabled={busy !== null}
          >
            <DownloadIcon />
            {busy === "audio"
              ? t("video.download.preparingAudio")
              : t("video.download.audio")}
          </Button>
        )}
      </Flex>
      {error && (
        <Text size="1" color="red">
          {t("video.download.failed", { message: error })}
        </Text>
      )}
    </Flex>
  );
}
