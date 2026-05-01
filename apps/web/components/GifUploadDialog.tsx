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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function GifUploadDialog({ open, onOpenChange }: Props) {
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;

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
    }
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
      setError("That doesn't look like a GIF. Pick a .gif file.");
      return;
    }
    setError(null);
    setFile(next);
  };

  const fileError = (() => {
    if (!file) return null;
    if (outputKind === "gif" && file.size > MAX_GIF_BYTES) {
      return `GIF is ${(file.size / 1024 ** 2).toFixed(1)} MB. Max is ${Math.round(
        MAX_GIF_BYTES / 1024 ** 2,
      )} MB.`;
    }
    if (
      outputKind === "gif" &&
      duration !== null &&
      duration > MAX_GIF_DURATION_SECONDS + 0.5
    ) {
      return `GIF is ${duration.toFixed(1)}s. Max length is ${MAX_GIF_DURATION_SECONDS}s.`;
    }
    return null;
  })();

  const working = busy || converting;
  const canSubmit =
    !working &&
    !otherTabBusy &&
    !!file &&
    !fileError &&
    title.trim().length >= 1;

  const submit = async () => {
    if (!file || !canSubmit) return;
    setError(null);
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
        <Dialog.Title>Upload a GIF</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Up to {Math.round(MAX_GIF_BYTES / 1024 ** 2)} MB and{" "}
          {MAX_GIF_DURATION_SECONDS} seconds when uploaded as a GIF. You can
          also convert it to an MP4 video instead.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Title
            </Text>
            <TextField.Root
              placeholder="My favorite loop"
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
              placeholder="reaction, funny, loop"
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
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Save as
            </Text>
            <SegmentedControl.Root
              value={outputKind}
              onValueChange={(v) => setOutputKind(v as "gif" | "mp4")}
            >
              <SegmentedControl.Item value="gif">GIF</SegmentedControl.Item>
              <SegmentedControl.Item value="mp4">
                Convert to MP4
              </SegmentedControl.Item>
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              {outputKind === "gif"
                ? "Stored as an animated GIF and shown on the GIFs page."
                : "Re-encoded to a 480p MP4 and saved to your videos."}
            </Text>
          </Flex>

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              GIF file
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
                      src={previewUrl}
                      alt={file.name}
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
                    <Box>
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
                        Remove
                      </Button>
                    </Box>
                  </Flex>
                </Flex>
              ) : (
                <Flex direction="column" align="center" gap="1">
                  <Text size="2" weight="medium">
                    Drop a GIF here, or click to browse
                  </Text>
                  <Text size="1" color="gray">
                    Up to {Math.round(MAX_GIF_BYTES / 1024 ** 2)} MB · .gif
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
          {converting && (
            <Callout.Root color="iris">
              <Callout.Text>
                Converting to MP4… {Math.round(convertProgress * 100)}%
              </Callout.Text>
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
            <Button variant="soft" color="gray" disabled={working}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={!canSubmit}>
            {converting
              ? "Converting…"
              : busy
                ? "Uploading…"
                : outputKind === "mp4"
                  ? "Convert & upload"
                  : "Upload GIF"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
