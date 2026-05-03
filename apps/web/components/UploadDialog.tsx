"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  SegmentedControl,
  Select,
  Slider,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_GB,
} from "@repo/shared";
import { isUploadBusy, useUpload } from "@/lib/upload-context";
import { trpc } from "@/lib/trpc";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { extractFrame } from "@/lib/extract-frame";
import { sniffIsVideoFile } from "@/lib/file-signatures";
import { useT } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";
import { useRouter } from "next/navigation";
import {
  VideoEditorDialog,
  type EditorOutput,
} from "./VideoEditorDialog";
import { Morph } from "./Morph";

const MAX_CUSTOM_THUMB_BYTES = 4 * 1024 * 1024;
const ALLOWED_THUMB_MIME = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional file to seed the form with — used when the dialog is opened
   * from a drag-and-drop drop or resumed after sign-in. Captured into local
   * state on each open so subsequent re-renders don't clobber the picker.
   */
  initialFile?: File | null;
}

export function UploadDialog({ open, onOpenChange, initialFile }: Props) {
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;
  const t = useT();

  const [source, setSource] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  // Server-side URL ingest is one shot — no client-side progress to
  // surface, just a busy flag while the mutation is in flight.
  const [urlSubmitting, setUrlSubmitting] = useState(false);
  const uploadFromUrl = trpc.videos.uploadFromUrl.useMutation();
  const utils = trpc.useUtils();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [downloadPolicy, setDownloadPolicy] = useState<
    "full" | "audio" | "none"
  >("full");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // sigCheck: "checking" while we read the header, "ok" / "bad" once
  // we know. The submit button waits on "ok" so a user can't sneak past
  // by clicking faster than we can read 32 bytes off disk.
  const [sigCheck, setSigCheck] = useState<"idle" | "checking" | "ok" | "bad">(
    "idle",
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState(1);
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const customThumbInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setTagsRaw("");
      setVisibility("public");
      setDownloadPolicy("full");
      setFile(null);
      setError(null);
      setEditorOpen(false);
      setThumbBlob(null);
      setThumbError(null);
      setVideoDuration(0);
      setScrubTime(1);
      setSigCheck("idle");
      setSource("file");
      setUrl("");
      setUrlSubmitting(false);
    } else if (initialFile) {
      // Seed from the dropped file when opened via the overlay. We only do
      // this on the open transition so the user can still clear/swap it
      // afterwards without it springing back.
      setFile(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Manage the object URL for the file's <video> source. Revoked when the
  // file changes or the dialog closes so we don't leak blobs across uploads.
  useEffect(() => {
    if (!file) {
      setVideoUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Same for the thumbnail preview URL.
  useEffect(() => {
    if (!thumbBlob) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbBlob]);

  // Verify the file actually starts with a known video container header.
  // The browser-reported MIME and the .ext are both spoofable; the bytes
  // are not. Runs whenever the file changes.
  useEffect(() => {
    if (!file) {
      setSigCheck("idle");
      return;
    }
    let cancelled = false;
    setSigCheck("checking");
    sniffIsVideoFile(file).then((ok) => {
      if (cancelled) return;
      setSigCheck(ok ? "ok" : "bad");
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Auto-capture a default thumbnail at ~1s when a new video file is picked.
  useEffect(() => {
    if (!file || !ALLOWED_VIDEO_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
    )) {
      return;
    }
    let cancelled = false;
    setThumbBusy(true);
    setThumbError(null);
    extractFrame(file, { atSeconds: 1 })
      .then(({ blob }) => {
        if (!cancelled) setThumbBlob(blob);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("Default thumbnail capture failed:", err);
          setThumbError(t("upload.thumb.autoFail"));
        }
      })
      .finally(() => {
        // Always clear busy, even if a newer effect run cancelled this one —
        // a leftover `true` would leave the thumbnail buttons permanently
        // disabled. Worst case we briefly clear and the new run sets it
        // back to `true` on its own setThumbBusy(true).
        setThumbBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, t]);

  const captureCurrentFrame = async () => {
    if (!file) return;
    setThumbBusy(true);
    setThumbError(null);
    try {
      const { blob } = await extractFrame(file, { atSeconds: scrubTime });
      setThumbBlob(blob);
    } catch (err) {
      setThumbError((err as Error).message);
    } finally {
      setThumbBusy(false);
    }
  };

  const onCustomThumbSelected = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED_THUMB_MIME.includes(f.type)) {
      setThumbError(t("upload.thumb.errorType"));
      return;
    }
    if (f.size > MAX_CUSTOM_THUMB_BYTES) {
      setThumbError(
        t("upload.thumb.errorSize", {
          actual: (f.size / 1024 ** 2).toFixed(1),
          max: MAX_CUSTOM_THUMB_BYTES / 1024 ** 2,
        }),
      );
      return;
    }
    setThumbError(null);
    setThumbBlob(f);
  };

  const tags = useMemo(
    () =>
      tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [tagsRaw],
  );

  const fileError = (() => {
    if (!file) return null;
    if (file.size > MAX_VIDEO_BYTES) {
      return t("upload.file.errorSize", {
        gib: (file.size / 1024 ** 3).toFixed(2),
        max: MAX_VIDEO_GB,
      });
    }
    if (
      !ALLOWED_VIDEO_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
      )
    ) {
      return t("upload.file.errorType", { type: file.type || "unknown" });
    }
    // The MIME check passed but the file's actual bytes don't match a
    // known video container — block the upload outright. Don't surface
    // the error while we're still reading the header (sigCheck === "checking").
    if (sigCheck === "bad") {
      return t("upload.file.errorSignatureVideo");
    }
    return null;
  })();

  const isHttpsUrl = /^https?:\/\//i.test(url.trim());
  const canSubmitFile =
    !busy &&
    !otherTabBusy &&
    !!file &&
    !fileError &&
    sigCheck === "ok" &&
    title.trim().length >= 1;
  const canSubmitUrl =
    !urlSubmitting &&
    !otherTabBusy &&
    isHttpsUrl &&
    title.trim().length >= 1;
  const canSubmit = source === "file" ? canSubmitFile : canSubmitUrl;

  // Step 1: clicking Upload opens the editor (file mode) or kicks off
  // a server-side fetch (URL mode).
  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    if (source === "file") {
      if (!file) return;
      setEditorOpen(true);
      return;
    }
    setUrlSubmitting(true);
    trackEvent("Upload Submitted", {
      kind: "video",
      source: "url",
      visibility,
    });
    try {
      await uploadFromUrl.mutateAsync({
        url: url.trim(),
        title: title.trim(),
        description: description.trim(),
        tags,
        visibility,
        downloadPolicy,
      });
      // Refresh listings + my-profile counts so the new video shows
      // up wherever the user already is, without a manual reload.
      // We deliberately don't navigate to /videos/<id> — fresh rows
      // aren't always immediately visible to a server-rendered
      // detail page, so jumping there can land on a transient 404.
      await Promise.all([
        utils.videos.list.invalidate(),
        utils.videos.search.invalidate().catch(() => {}),
        utils.auth.me.invalidate().catch(() => {}),
      ]);
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUrlSubmitting(false);
    }
  };

  // Step 2: editor returns either an edit options bundle (video) or a
  // pre-built gif blob.
  const startUploadFromEditor = async (output: EditorOutput) => {
    if (!file) return;
    setEditorOpen(false);
    // Fire at the moment the upload actually starts (post-editor) so
    // dialog-open + abandon doesn't inflate the count. The editor can
    // emit either a video or a gif blob, so reflect that in `kind`.
    trackEvent("Upload Submitted", {
      kind: output.kind,
      source: "file",
      visibility,
    });
    try {
      if (output.kind === "video") {
        await upload.start(
          file,
          {
            title: title.trim(),
            description: description.trim(),
            tags,
            mimeType: file.type,
            visibility,
            downloadPolicy,
          },
          { edit: output.edit, thumbnailBlob: thumbBlob ?? undefined },
        );
      } else {
        await upload.startGif(
          output.blob,
          {
            title: title.trim(),
            description: description.trim(),
            tags,
            visibility,
          },
          output.durationSeconds,
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
        <Dialog.Title>{t("upload.video.title")}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          {t("upload.video.subtitle", { gb: MAX_VIDEO_GB })}
        </Dialog.Description>

        {/* viewKey omitted on purpose — typing in TextField/TextArea must
            not remount the form. Height still animates via ResizeObserver. */}
        <Morph axis="height">
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.source.label")}
            </Text>
            <SegmentedControl.Root
              value={source}
              onValueChange={(v) => {
                if (busy || urlSubmitting) return;
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
              placeholder={t("upload.field.title.placeholder")}
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
              placeholder={t("upload.field.tags.placeholder")}
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

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.video.download.label")}
            </Text>
            {/* Three options with long Ukrainian labels overflow a
                SegmentedControl on narrow mobile widths, so we use a
                Select here — it fits any container width. */}
            <Select.Root
              value={downloadPolicy}
              onValueChange={(v) =>
                setDownloadPolicy(v as "full" | "audio" | "none")
              }
            >
              <Select.Trigger style={{ width: "100%" }} />
              <Select.Content>
                <Select.Item value="full">
                  {t("upload.video.download.full")}
                </Select.Item>
                <Select.Item value="audio">
                  {t("upload.video.download.audio")}
                </Select.Item>
                <Select.Item value="none">
                  {t("upload.video.download.none")}
                </Select.Item>
              </Select.Content>
            </Select.Root>
            <Text size="1" color="gray">
              {downloadPolicy === "full"
                ? t("upload.video.download.hint.full")
                : downloadPolicy === "audio"
                  ? t("upload.video.download.hint.audio")
                  : t("upload.video.download.hint.none")}
            </Text>
          </Flex>

          {source === "file" && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.field.videoFile")}
            </Text>
            <input
              type="file"
              accept={ALLOWED_VIDEO_MIME_TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </Flex>
          )}

          {source === "url" && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {t("upload.url.label")}
            </Text>
            <TextField.Root
              type="url"
              placeholder={t("upload.url.placeholder")}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={urlSubmitting}
              maxLength={2048}
            />
            <Text size="1" color="gray">
              {t("upload.url.hint")}
            </Text>
          </Flex>
          )}

          {source === "file" && file && !fileError && (
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                {t("upload.field.thumbnail")}
              </Text>
              <Flex gap="3" align="start" wrap="wrap">
                <Box
                  style={{
                    width: 192,
                    aspectRatio: "16 / 9",
                    background: "var(--gray-3)",
                    borderRadius: "var(--radius-2)",
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt="Thumbnail preview"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <Text size="1" color="gray">
                      {thumbBusy
                        ? t("upload.thumb.capturing")
                        : t("card.noThumbnail")}
                    </Text>
                  )}
                </Box>

                <Flex direction="column" gap="2" style={{ flex: 1, minWidth: 220 }}>
                  {videoUrl && (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      muted
                      playsInline
                      // autoPlay is the only reliable way to coax iOS
                      // Safari into firing loadedmetadata + painting a
                      // first frame without a user gesture (preload=auto
                      // alone gets downgraded). We pause it the instant
                      // playback starts so the user doesn't see motion;
                      // by then the metadata + frame are populated and
                      // the scrubber + thumbnail capture both work.
                      autoPlay
                      preload="auto"
                      onPlay={(e) => {
                        e.currentTarget.pause();
                      }}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        setVideoDuration(v.duration || 0);
                        setScrubTime(Math.min(1, v.duration || 1));
                      }}
                      onSeeked={(e) => {
                        // Keep state in sync if the user drags the native bar.
                        setScrubTime(e.currentTarget.currentTime);
                      }}
                      style={{
                        width: "100%",
                        background: "black",
                        borderRadius: "var(--radius-2)",
                        aspectRatio: "16 / 9",
                        objectFit: "contain",
                      }}
                    />
                  )}
                  <Flex align="center" gap="2">
                    <Text size="1" color="gray" style={{ width: 64 }}>
                      {t("upload.thumb.frame")}
                    </Text>
                    <Box style={{ flex: 1 }}>
                      <Slider
                        value={[Math.round(scrubTime * 1000)]}
                        min={0}
                        max={Math.max(1, Math.round(videoDuration * 1000))}
                        step={100}
                        onValueChange={(v) => {
                          const next = (v[0] ?? 0) / 1000;
                          setScrubTime(next);
                          if (videoRef.current) {
                            videoRef.current.currentTime = next;
                          }
                        }}
                        size="1"
                        aria-label="Pick thumbnail frame"
                        disabled={!videoDuration}
                      />
                    </Box>
                    <Text size="1" color="gray" style={{ width: 48 }}>
                      {scrubTime.toFixed(1)}s
                    </Text>
                  </Flex>
                  <Flex gap="2" wrap="wrap">
                    <Button
                      variant="soft"
                      size="2"
                      onClick={captureCurrentFrame}
                      // Don't gate on videoDuration — extractFrame loads
                      // its own off-DOM video and clamps to the actual
                      // duration internally. If the inline <video>'s
                      // onLoadedMetadata is slow/never fires, the user can
                      // still capture at scrubTime=1.
                      disabled={thumbBusy}
                      type="button"
                    >
                      {t("upload.thumb.useFrame")}
                    </Button>
                    <Button
                      variant="soft"
                      color="gray"
                      size="2"
                      type="button"
                      onClick={() => customThumbInputRef.current?.click()}
                      disabled={thumbBusy}
                    >
                      {t("upload.thumb.uploadCustom")}
                    </Button>
                    <input
                      ref={customThumbInputRef}
                      type="file"
                      accept={ALLOWED_THUMB_MIME.join(",")}
                      onChange={(e) => {
                        onCustomThumbSelected(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                  </Flex>
                  {thumbError && (
                    <Text size="1" color="red">
                      {thumbError}
                    </Text>
                  )}
                </Flex>
              </Flex>
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
          {urlSubmitting && (
            <Callout.Root color="iris">
              <Callout.Text>{t("upload.url.fetching")}</Callout.Text>
            </Callout.Root>
          )}
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
        </Morph>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button
              variant="soft"
              color="gray"
              disabled={busy || urlSubmitting}
            >
              {t("common.cancel")}
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={!canSubmit}>
            {source === "url"
              ? urlSubmitting
                ? t("upload.url.submitting")
                : t("upload.url.submit")
              : busy
                ? t("upload.busy")
                : t("upload.continue")}
          </Button>
        </Flex>
      </Dialog.Content>

      <VideoEditorDialog
        open={editorOpen}
        file={file}
        onCancel={() => setEditorOpen(false)}
        onApply={startUploadFromEditor}
      />
    </Dialog.Root>
  );
}
