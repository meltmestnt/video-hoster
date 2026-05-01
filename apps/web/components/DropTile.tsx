"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Callout, Flex, Heading, Text } from "@radix-ui/themes";
import {
  ImageIcon,
  PlayIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { useRequireAuth } from "@/lib/auth-required";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import {
  classifyDroppedFile,
  setPendingUpload,
  type PendingUploadKind,
} from "@/lib/pending-upload";
import { useT } from "@/lib/i18n";

export type DropTileMode = "any" | "video" | "gif";

interface Props {
  /**
   * "any" accepts both videos and GIFs and routes to the matching dialog.
   * "video" / "gif" pin the dialog kind and reject the other type with
   * an inline error.
   */
  mode: DropTileMode;
  signedIn: boolean;
}

/**
 * Inline drop pane shown on the dashboard, /videos, and /gifs. Static
 * dashed-border card (no border animation) — when a file is dragged
 * over it, the border + background brighten to indicate the drop will
 * land here. On drop:
 *   - signed-in user → matching upload dialog opens with the file pre-
 *     filled via the lifted UploadDialogProvider.
 *   - signed-out user → file is stashed in IDB and the auth-required
 *     dialog opens. After login, <PendingUploadResumer> picks the file
 *     back up and opens the dialog automatically.
 *
 * Differs from <DropZoneOverlay>, which only fires when the user drags
 * over the page gutters/empty space — this is an explicit landing pad
 * that's always visible above the feed.
 */
export function DropTile({ mode, signedIn }: Props) {
  const t = useT();
  const requireAuth = useRequireAuth();
  const uploadDialog = useUploadDialog();
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drag events bubble through every DOM ancestor; use a depth counter
  // so dragleave doesn't drop us out of "hovered" the moment the cursor
  // crosses an inner child.
  const depthRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-clear the inline error after a short window so it doesn't
  // linger after the user fixes the drop.
  useEffect(() => {
    if (!error) return;
    const handle = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(handle);
  }, [error]);

  const accept =
    mode === "video"
      ? "video/mp4,video/webm,video/quicktime,video/x-matroska"
      : mode === "gif"
        ? "image/gif,.gif"
        : "video/mp4,video/webm,video/quicktime,video/x-matroska,image/gif,.gif";

  const handleFile = (file: File) => {
    const kind = classifyDroppedFile(file);
    if (!kind) {
      setError(t("dropzone.unsupported"));
      return;
    }
    if (mode === "video" && kind !== "video") {
      setError(t("droptile.error.notVideo"));
      return;
    }
    if (mode === "gif" && kind !== "gif") {
      setError(t("droptile.error.notGif"));
      return;
    }
    setError(null);
    if (!signedIn) {
      // Stash so the file survives the OAuth round-trip.
      void setPendingUpload(kind as PendingUploadKind, file);
      requireAuth();
      return;
    }
    if (kind === "video") uploadDialog.openVideoUpload(file);
    else uploadDialog.openGifUpload(file);
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    depthRef.current += 1;
    setHover(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setHover(false);
  };

  const onDrop = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    depthRef.current = 0;
    setHover(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    handleFile(file);
  };

  const titleKey =
    mode === "video"
      ? "droptile.title.video"
      : mode === "gif"
        ? "droptile.title.gif"
        : "droptile.title.any";
  const subtitleKey =
    mode === "video"
      ? "droptile.subtitle.video"
      : mode === "gif"
        ? "droptile.subtitle.gif"
        : "droptile.subtitle.any";

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        mb="5"
        style={{
          cursor: "pointer",
          // Static dashed border — no animation. When hovered/dragged
          // over, brighten the border and tint the background.
          border: `1.5px dashed ${
            hover ? "var(--accent-9)" : "var(--gray-7)"
          }`,
          borderRadius: "var(--radius-4)",
          padding: "24px 28px",
          background: hover ? "var(--accent-3)" : "var(--gray-2)",
          transition:
            "background 160ms ease, border-color 160ms ease",
          outline: "none",
        }}
      >
        <Flex align="center" gap="4" wrap="wrap">
          <Flex
            align="center"
            justify="center"
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--accent-4)",
              color: "var(--accent-11)",
              flexShrink: 0,
            }}
          >
            {mode === "gif" ? (
              <ImageIcon width="22" height="22" />
            ) : mode === "video" ? (
              <PlayIcon width="22" height="22" />
            ) : (
              <UploadIcon width="22" height="22" />
            )}
          </Flex>
          <Box style={{ flex: 1, minWidth: 220 }}>
            <Heading size="4" mb="1">
              {t(titleKey)}
            </Heading>
            <Text as="p" size="2" color="gray">
              {t(subtitleKey)}
            </Text>
          </Box>
        </Flex>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </Box>
      {error && (
        <Box mb="4">
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Box>
      )}
    </>
  );
}
