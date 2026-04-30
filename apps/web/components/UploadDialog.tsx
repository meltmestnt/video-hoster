"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Callout,
  Dialog,
  Flex,
  SegmentedControl,
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

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setTagsRaw("");
      setVisibility("public");
      setFile(null);
      setError(null);
    }
  }, [open]);

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

  const submit = async () => {
    if (!file || !canSubmit) return;
    setError(null);
    try {
      await upload.start(file, {
        title: title.trim(),
        description: description.trim(),
        tags,
        mimeType: file.type,
        visibility,
      });
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
          Up to {MAX_VIDEO_GB} GiB. A thumbnail is generated from a random
          frame after upload.
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
            {busy ? "Uploading..." : "Upload"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
