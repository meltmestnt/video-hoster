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
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { MAX_GIF_BYTES, MAX_GIF_DURATION_SECONDS } from "@repo/shared";
import { isUploadBusy, useUpload } from "@/lib/upload-context";
import { compressTo480p } from "@/lib/compress-video";
import { sniffIsGifFile } from "@/lib/file-signatures";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { Morph } from "./Morph";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed the dropzone with a file dragged in from outside the dialog. */
  initialFile?: File | null;
}

// GIFs encode per-frame delay in 1/100 of a second inside Graphic Control
// Extension blocks (header 0x21 0xF9 0x04). Walk the bytes and sum delays —
// good enough for showing the user a duration and for the upload schema.
async function gifDurationSeconds(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let total = 0;
  let frames = 0;
  for (let i = 0; i + 7 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      const raw = bytes[i + 4] | (bytes[i + 5] << 8);
      // Many encoders emit delay=0 expecting the renderer to use ~100ms;
      // browsers do this, so match the visual playback.
      total += raw <= 1 ? 10 : raw;
      frames++;
      i += 7;
    }
  }
  if (frames === 0) return 0;
  return total / 100;
}

export function GifUploadDialog({ open, onOpenChange, initialFile }: Props) {
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;
  const t = useT();

  const [source, setSource] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const uploadFromUrl = trpc.gifs.uploadFromUrl.useMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [outputKind, setOutputKind] = useState<"gif" | "mp4">("gif");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same magic-byte gate as UploadDialog: hold submit until we've
  // confirmed the file actually starts with a GIF header.
  const [sigCheck, setSigCheck] = useState<"idle" | "checking" | "ok" | "bad">(
    "idle",
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [screenshotMsg, setScreenshotMsg] = useState<
    | { kind: "ok"; id: string }
    | { kind: "error"; message: string }
    | null
  >(null);

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
      setTitle("");
      setDescription("");
      setTagsRaw("");
      setVisibility("public");
      setOutputKind("gif");
      setFile(null);
      setDuration(null);
      setDragging(false);
      setConvertProgress(0);
      setConverting(false);
      setError(null);
      setScreenshotBusy(false);
      setScreenshotMsg(null);
      setSigCheck("idle");
      setSource("file");
      setUrl("");
      setUrlSubmitting(false);
    } else if (initialFile) {
      // Validate via acceptFile so a wrong-type drop falls back to the
      // dropzone with an error message instead of silently failing later.
      acceptFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!file) {
      setDuration(null);
      return;
    }
    let cancelled = false;
    gifDurationSeconds(file)
      .then((d) => {
        if (!cancelled) setDuration(d);
      })
      .catch(() => {
        if (!cancelled) setDuration(0);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Magic-byte check — bytes win over MIME and extension when they
  // disagree. Submit waits on "ok".
  useEffect(() => {
    if (!file) {
      setSigCheck("idle");
      return;
    }
    let cancelled = false;
    setSigCheck("checking");
    sniffIsGifFile(file).then((ok) => {
      if (cancelled) return;
      setSigCheck(ok ? "ok" : "bad");
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const tags = useMemo(
    () =>
      tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [tagsRaw],
  );

  const acceptFile = (next: File | undefined | null) => {
    if (!next) return;
    if (
      next.type !== "image/gif" &&
      !next.name.toLowerCase().endsWith(".gif")
    ) {
      setError(t("upload.gif.notGif"));
      return;
    }
    setError(null);
    setFile(next);
  };

  const fileError = (() => {
    if (!file) return null;
    if (outputKind === "gif" && file.size > MAX_GIF_BYTES) {
      return t("upload.gif.tooBig", {
        size: (file.size / 1024 ** 2).toFixed(1),
        max: Math.round(MAX_GIF_BYTES / 1024 ** 2),
      });
    }
    if (
      outputKind === "gif" &&
      duration !== null &&
      duration > MAX_GIF_DURATION_SECONDS + 0.5
    ) {
      return t("upload.gif.tooLong", {
        sec: duration.toFixed(1),
        max: MAX_GIF_DURATION_SECONDS,
      });
    }
    if (sigCheck === "bad") {
      return t("upload.file.errorSignatureGif");
    }
    return null;
  })();

  const working = busy || converting;
  const isHttpsUrl = /^https?:\/\//i.test(url.trim());
  const canSubmitFile =
    !working &&
    !otherTabBusy &&
    sigCheck === "ok" &&
    !!file &&
    !fileError &&
    title.trim().length >= 1;
  const canSubmitUrl =
    !urlSubmitting &&
    !otherTabBusy &&
    isHttpsUrl &&
    title.trim().length >= 1;
  const canSubmit = source === "file" ? canSubmitFile : canSubmitUrl;

  const captureScreenshot = async () => {
    const img = previewImgRef.current;
    if (!img || !file) return;
    setScreenshotBusy(true);
    setScreenshotMsg(null);
    try {
      // Browsers don't expose an API to seek a GIF — clicking "Capture"
      // grabs whatever frame is currently animating. We render to a canvas
      // at the natural dimensions, so quality matches the source GIF.
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        throw new Error(t("screenshots.gif.notReady"));
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.drawImage(img, 0, 0, w, h);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Canvas toBlob returned null")),
          "image/png",
        ),
      );
      const baseTitle =
        file.name.replace(/\.[^.]+$/, "").trim() || "GIF screenshot";
      const result = await upload.uploadScreenshot(blob, {
        title: `${baseTitle} frame`,
        visibility: "public",
        source: "gif",
        width: w,
        height: h,
      });
      setScreenshotMsg({ kind: "ok", id: result.screenshotId });
    } catch (err) {
      setScreenshotMsg({ kind: "error", message: (err as Error).message });
    } finally {
      setScreenshotBusy(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    if (source === "url") {
      // URL ingest is GIF-only — we don't expose the gif→mp4 conversion
      // path here because that flow is client-side ffmpeg.wasm and we
      // don't have the bytes locally yet. The server still
      // re-compresses the fetched GIF the same way as a normal upload.
      setUrlSubmitting(true);
      try {
        await uploadFromUrl.mutateAsync({
          url: url.trim(),
          title: title.trim(),
          description: description.trim(),
          tags,
          visibility,
        });
        onOpenChange(false);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUrlSubmitting(false);
      }
      return;
    }
    if (!file) return;
    try {
      if (outputKind === "gif") {
        const d = duration ?? (await gifDurationSeconds(file));
        await upload.startGif(
          file,
          {
            title: title.trim(),
            description: description.trim(),
            tags,
            visibility,
          },
          // The schema caps duration; clamp so a missing/oversized header
          // doesn't fail validation when the bytes are otherwise fine.
          Math.max(0.1, Math.min(d || 0.1, MAX_GIF_DURATION_SECONDS)),
        );
      } else {
        setConvertProgress(0);
        setConverting(true);
        let mp4Blob: Blob;
        try {
          mp4Blob = await compressTo480p(file, {
            noAudio: true,
            onProgress: setConvertProgress,
          });
        } finally {
          setConverting(false);
        }
        const baseName = file.name.replace(/\.gif$/i, "") || "converted";
        const mp4File = new File([mp4Blob], `${baseName}.mp4`, {
          type: "video/mp4",
        });
        await upload.start(
          mp4File,
          {
            title: title.trim(),
            description: description.trim(),
            tags,
            mimeType: "video/mp4",
            visibility,
          },
          { skipCompression: true },
        );
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>{t("upload.gif.title")}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          {t("upload.gif.subtitle", {
            mb: Math.round(MAX_GIF_BYTES / 1024 ** 2),
            sec: MAX_GIF_DURATION_SECONDS,
          })}
        </Dialog.Description>

        <Morph axis="height">
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.source.label")}
            </Text>
            <SegmentedControl.Root
              value={source}
              onValueChange={(v) => {
                if (working || urlSubmitting) return;
                setSource(v as "file" | "url");
                setError(null);
              }}
            >
              <SegmentedControl.Item value="file">
                {t("upload.source.file")}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="url">
                {t("upload.source.url")}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.field.title")}
            </Text>
            <TextField.Root
              placeholder={t("upload.gif.title.placeholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.field.description")}
            </Text>
            <TextArea
              placeholder={t("upload.field.description.placeholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.field.tags")} <Text color="gray">{t("upload.field.tags.hint")}</Text>
            </Text>
            <TextField.Root
              placeholder={t("upload.field.tags.gif.placeholder")}
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.field.visibility")}
            </Text>
            <SegmentedControl.Root
              value={visibility}
              onValueChange={(v) => setVisibility(v as "public" | "private")}
            >
              <SegmentedControl.Item value="public">
                {t("common.public")}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="private">
                {t("common.private")}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              {visibility === "public"
                ? t("upload.visibility.publicHint")
                : t("upload.visibility.privateHint")}
            </Text>
          </Flex>

          {source === "file" && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.gif.saveAs")}
            </Text>
            <SegmentedControl.Root
              value={outputKind}
              onValueChange={(v) => setOutputKind(v as "gif" | "mp4")}
            >
              <SegmentedControl.Item value="gif">
                {t("upload.gif.saveAs.gif")}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="mp4">
                {t("upload.gif.saveAs.mp4")}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              {outputKind === "gif"
                ? t("upload.gif.saveAs.gifHint")
                : t("upload.gif.saveAs.mp4Hint")}
            </Text>
          </Flex>
          )}

          {source === "url" && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.url.gif.label")}
            </Text>
            <TextField.Root
              type="url"
              placeholder={t("upload.url.gif.placeholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={urlSubmitting}
              maxLength={2048}
            />
            <Text size="1" color="gray">
              {t("upload.url.gif.hint")}
            </Text>
          </Flex>
          )}

          {source === "file" && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.gif.fileLabel")}
            </Text>
            <Box
              role="button"
              tabIndex={0}
              onClick={() => !working && inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!working) inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!working) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (working) return;
                acceptFile(e.dataTransfer.files?.[0]);
              }}
              style={{
                cursor: working ? "not-allowed" : "pointer",
                border: `1.5px dashed ${
                  dragging ? "var(--accent-9)" : "var(--gray-7)"
                }`,
                borderRadius: "var(--radius-3)",
                padding: file ? 12 : 24,
                background: dragging
                  ? "var(--accent-3)"
                  : "var(--gray-2)",
                transition:
                  "background 120ms ease, border-color 120ms ease",
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={previewImgRef}
                      src={previewUrl}
                      alt={file.name}
                      crossOrigin="anonymous"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
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
                      {duration !== null && duration > 0
                        ? ` · ${duration.toFixed(1)}s`
                        : ""}
                    </Text>
                    <Flex gap="1" wrap="wrap">
                      <Button
                        size="1"
                        variant="soft"
                        color="gray"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        disabled={working}
                      >
                        {t("common.remove")}
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        color="iris"
                        onClick={(e) => {
                          e.stopPropagation();
                          captureScreenshot();
                        }}
                        disabled={working || screenshotBusy}
                      >
                        {screenshotBusy
                          ? t("screenshots.gif.saving")
                          : t("screenshots.gif.button")}
                      </Button>
                    </Flex>
                  </Flex>
                </Flex>
              ) : (
                <Flex direction="column" align="center" gap="1">
                  <Text size="2" weight="medium">
                    {t("upload.gif.dropHint")}
                  </Text>
                  <Text size="1" color="gray">
                    {t("upload.gif.dropSize", {
                      mb: Math.round(MAX_GIF_BYTES / 1024 ** 2),
                    })}
                  </Text>
                </Flex>
              )}
            </Box>
            <input
              ref={inputRef}
              type="file"
              accept="image/gif,.gif"
              style={{ display: "none" }}
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                // Reset value so picking the same file twice still fires.
                e.target.value = "";
              }}
              disabled={working}
            />
          </Flex>
          )}

          {otherTabBusy && (
            <Callout.Root color="amber">
              <Callout.Text>{t("upload.otherTab.busy")}</Callout.Text>
            </Callout.Root>
          )}
          {source === "file" && fileError && (
            <Callout.Root color="red">
              <Callout.Text>{fileError}</Callout.Text>
            </Callout.Root>
          )}
          {converting && (
            <Callout.Root color="iris">
              <Callout.Text>
                {t("upload.gif.converting", {
                  pct: Math.round(convertProgress * 100),
                })}
              </Callout.Text>
            </Callout.Root>
          )}
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {screenshotMsg?.kind === "ok" && (
            <Callout.Root color="iris">
              <Callout.Text>
                <span
                  dangerouslySetInnerHTML={{
                    __html: t("screenshots.editor.savedHtml", {
                      href: `/screenshots/${screenshotMsg.id}`,
                    }),
                  }}
                />
              </Callout.Text>
            </Callout.Root>
          )}
          {screenshotMsg?.kind === "error" && (
            <Callout.Root color="red">
              <Callout.Text>{screenshotMsg.message}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
        </Morph>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button
              variant="soft"
              color="gray"
              disabled={working || urlSubmitting}
            >
              {t("common.cancel")}
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={!canSubmit}>
            {source === "url"
              ? urlSubmitting
                ? t("upload.url.submitting")
                : t("upload.url.submit")
              : converting
                ? t("upload.gif.convertingShort")
                : busy
                  ? t("upload.gif.uploading")
                  : outputKind === "mp4"
                    ? t("upload.gif.convertAndUpload")
                    : t("upload.gif.upload")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
