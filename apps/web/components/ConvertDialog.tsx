"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  SegmentedControl,
  Text,
} from "@radix-ui/themes";
import { DownloadIcon } from "@radix-ui/react-icons";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_GIF_DURATION_SECONDS,
} from "@repo/shared";
import { compressTo480p, convertToGif } from "@/lib/compress-video";
import { useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "video2gif" | "gif2video";

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

export function ConvertDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("video2gif");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) {
      setMode("video2gif");
      setFile(null);
      setDragging(false);
      setBusy(false);
      setProgress(0);
      setError(null);
      setResultBlob(null);
      setResultName(null);
    }
  }, [open]);

  // Switching mode invalidates the picked file (different mime types).
  useEffect(() => {
    setFile(null);
    setError(null);
    setResultBlob(null);
    setResultName(null);
    setProgress(0);
  }, [mode]);

  const accept =
    mode === "video2gif" ? ALLOWED_VIDEO_MIME_TYPES.join(",") : "image/gif,.gif";

  const acceptFile = (next: File | undefined | null) => {
    if (!next) return;
    if (mode === "video2gif") {
      if (
        !ALLOWED_VIDEO_MIME_TYPES.includes(
          next.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
        )
      ) {
        setError(t("convert.error.notVideo"));
        return;
      }
    } else {
      if (
        next.type !== "image/gif" &&
        !next.name.toLowerCase().endsWith(".gif")
      ) {
        setError(t("convert.error.notGif"));
        return;
      }
    }
    setError(null);
    setFile(next);
    setResultBlob(null);
    setResultName(null);
  };

  const baseStem = (name: string) =>
    name.replace(/\.[^.]+$/, "").trim() || "converted";

  const run = async () => {
    if (!file) return;
    setError(null);
    setResultBlob(null);
    setResultName(null);
    setBusy(true);
    setProgress(0);
    try {
      let blob: Blob;
      let outName: string;
      if (mode === "video2gif") {
        blob = await convertToGif(file, { onProgress: setProgress });
        outName = `${baseStem(file.name)}.gif`;
      } else {
        blob = await compressTo480p(file, {
          noAudio: true,
          onProgress: setProgress,
        });
        outName = `${baseStem(file.name)}.mp4`;
      }
      setResultBlob(blob);
      setResultName(outName);
      // Auto-trigger the save dialog — the user clicked Convert and waited,
      // they don't want to click again. We still show a Download button in
      // case the auto-save was blocked.
      triggerDownload(blob, outName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>{t("convert.title")}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          {t("convert.subtitle")}
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("convert.mode.label")}
            </Text>
            <SegmentedControl.Root
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
            >
              <SegmentedControl.Item value="video2gif">
                {t("convert.mode.video2gif")}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="gif2video">
                {t("convert.mode.gif2video")}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              {mode === "video2gif"
                ? t("convert.mode.hint.video2gif", {
                    s: MAX_GIF_DURATION_SECONDS,
                  })
                : t("convert.mode.hint.gif2video")}
            </Text>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {mode === "video2gif"
                ? t("convert.field.video")
                : t("convert.field.gif")}
            </Text>
            <Box
              role="button"
              tabIndex={0}
              onClick={() => !busy && inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!busy) inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (busy) return;
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              style={{
                cursor: busy ? "not-allowed" : "pointer",
                border: `1.5px dashed ${
                  dragging ? "var(--accent-9)" : "var(--gray-7)"
                }`,
                borderRadius: "var(--radius-3)",
                padding: file ? 12 : 24,
                background: dragging ? "var(--accent-3)" : "var(--gray-2)",
                transition: "background 120ms ease, border-color 120ms ease",
                outline: "none",
              }}
            >
              {file && previewUrl ? (
                <Flex align="center" gap="3">
                  <Box
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: "var(--radius-2)",
                      overflow: "hidden",
                      background: "black",
                      flexShrink: 0,
                    }}
                  >
                    {mode === "gif2video" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt={file.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <video
                        src={previewUrl}
                        muted
                        playsInline
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    )}
                  </Box>
                  <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                    <Text
                      size="2"
                      weight="medium"
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {file.name}
                    </Text>
                    <Text size="1" color="gray">
                      {(file.size / 1024 ** 2).toFixed(2)} MB
                    </Text>
                    <Box>
                      <Button
                        size="1"
                        variant="soft"
                        color="gray"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setResultBlob(null);
                          setResultName(null);
                        }}
                        disabled={busy}
                      >
                        {t("common.remove")}
                      </Button>
                    </Box>
                  </Flex>
                </Flex>
              ) : (
                <Flex direction="column" align="center" gap="1">
                  <Text size="2" weight="medium">
                    {mode === "video2gif"
                      ? t("convert.dropHint.video")
                      : t("convert.dropHint.gif")}
                  </Text>
                </Flex>
              )}
            </Box>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              style={{ display: "none" }}
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
              disabled={busy}
            />
          </Flex>

          {busy && (
            <Callout.Root color="iris">
              <Callout.Text>
                {t("convert.progress", { pct: Math.round(progress * 100) })}
              </Callout.Text>
            </Callout.Root>
          )}
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {resultBlob && resultName && !busy && (
            <Callout.Root color="iris">
              <Callout.Text>
                {t("convert.done", { name: resultName })}
              </Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </Dialog.Close>
          {resultBlob && resultName && !busy ? (
            <Button
              onClick={() => triggerDownload(resultBlob, resultName)}
              variant="solid"
              color="iris"
            >
              <DownloadIcon />
              {t("convert.downloadAgain")}
            </Button>
          ) : (
            <Button onClick={run} disabled={!file || busy}>
              {busy ? t("convert.converting") : t("convert.run")}
            </Button>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
