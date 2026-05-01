"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  SegmentedControl,
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
import { extractFrame } from "@/lib/extract-frame";
import {
  VideoEditorDialog,
  type EditorOutput,
} from "./VideoEditorDialog";

const MAX_CUSTOM_THUMB_BYTES = 4 * 1024 * 1024;
const ALLOWED_THUMB_MIME = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadDialog({ open, onOpenChange }: Props) {
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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
      setFile(null);
      setError(null);
      setEditorOpen(false);
      setThumbBlob(null);
      setThumbError(null);
      setVideoDuration(0);
      setScrubTime(1);
    }
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
          setThumbError(
            "Couldn't auto-generate a thumbnail. Pick a frame or upload a custom image.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setThumbBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

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
      setThumbError("Thumbnail must be a JPEG, PNG, or WebP image.");
      return;
    }
    if (f.size > MAX_CUSTOM_THUMB_BYTES) {
      setThumbError(
        `Image is ${(f.size / 1024 ** 2).toFixed(1)} MB. Max allowed is ${MAX_CUSTOM_THUMB_BYTES / 1024 ** 2} MB.`,
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
      return `File is ${(file.size / 1024 ** 3).toFixed(2)} GiB. Max allowed is ${MAX_VIDEO_GB} GiB.`;
    }
    if (
      !ALLOWED_VIDEO_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
      )
    ) {
      return `Unsupported file type: ${file.type || "unknown"}.`;
    }
    return null;
  })();

  const canSubmit =
    !busy &&
    !otherTabBusy &&
    !!file &&
    !fileError &&
    title.trim().length >= 1;

  // Step 1: clicking Upload opens the editor instead of starting upload.
  const submit = () => {
    if (!file || !canSubmit) return;
    setError(null);
    setEditorOpen(true);
  };

  // Step 2: editor returns either an edit options bundle (video) or a
  // pre-built gif blob.
  const startUploadFromEditor = async (output: EditorOutput) => {
    if (!file) return;
    setEditorOpen(false);
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
        <Dialog.Title>Upload a video</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Up to {MAX_VIDEO_GB} GiB. Pick a frame for the thumbnail or upload
          your own image.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Title
            </Text>
            <TextField.Root
              placeholder="My weekend hike"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Description
            </Text>
            <TextArea
              placeholder="What's it about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Tags <Text color="gray">(comma-separated)</Text>
            </Text>
            <TextField.Root
              placeholder="hiking, nature, vlog"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Visibility
            </Text>
            <SegmentedControl.Root
              value={visibility}
              onValueChange={(v) => setVisibility(v as "public" | "private")}
            >
              <SegmentedControl.Item value="public">
                Public
              </SegmentedControl.Item>
              <SegmentedControl.Item value="private">
                Private
              </SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              {visibility === "public"
                ? "Visible on the dashboard and in suggestions for everyone."
                : "Only you can see this video."}
            </Text>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Video file
            </Text>
            <input
              type="file"
              accept={ALLOWED_VIDEO_MIME_TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </Flex>

          {file && !fileError && (
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                Thumbnail
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
                      {thumbBusy ? "Capturing..." : "No thumbnail"}
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
                      preload="metadata"
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
                      Frame
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
                      disabled={thumbBusy || !videoDuration}
                      type="button"
                    >
                      Use this frame
                    </Button>
                    <Button
                      variant="soft"
                      color="gray"
                      size="2"
                      type="button"
                      onClick={() => customThumbInputRef.current?.click()}
                      disabled={thumbBusy}
                    >
                      Upload custom
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
              <Callout.Text>
                Another tab is already uploading. Wait for it to finish before
                starting a new upload here.
              </Callout.Text>
            </Callout.Root>
          )}
          {fileError && (
            <Callout.Root color="red">
              <Callout.Text>{fileError}</Callout.Text>
            </Callout.Root>
          )}
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={busy}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Uploading..." : "Continue"}
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
