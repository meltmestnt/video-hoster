"use client";

import { Box, Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import { useRequireAuth } from "@/lib/auth-required";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import { useT } from "@/lib/i18n";
import {
  classifyDroppedFile,
  setPendingUpload,
} from "@/lib/pending-upload";
import { sniffFileKind } from "@/lib/file-signatures";

interface Props {
  signedIn: boolean;
}

/**
 * Window-level drag-and-drop catcher. Sits invisibly above the page tree;
 * when the user drags a file from outside the browser into the viewport
 * we fade in a fullscreen pane that explains what'll happen on drop.
 *
 * Drag events bubble through every DOM ancestor, so dragenter / dragleave
 * can each fire multiple times for one logical "drag in." We dedupe with
 * a counter — the visual overlay only goes away when the count hits zero.
 */
export function DropZoneOverlay({ signedIn }: Props) {
  const t = useT();
  const requireAuth = useRequireAuth();
  const uploadDialog = useUploadDialog();

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    // Only treat this as a real file drag if the OS is offering files —
    // text selections and intra-page Radix drags also fire dragenter, and
    // we don't want our overlay popping up on those.
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setActive(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Suppress the browser's default "open the file in this tab" behavior.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setActive(false);
    };

    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      // Trust the bytes over the filename. classifyDroppedFile is the
      // fallback for environments where the header read fails (very large
      // files in some Safari builds, etc.) — both must agree on a kind
      // before we route the file into a dialog.
      const sniffed = await sniffFileKind(file);
      const kind = sniffed ?? classifyDroppedFile(file);
      if (!kind) {
        setError(t("dropzone.unsupported"));
        return;
      }
      setError(null);
      if (!signedIn) {
        // The File is held in IDB so it survives the OAuth round-trip;
        // PendingUploadResumer will pick it back up after sign-in.
        void setPendingUpload(kind, file);
        requireAuth();
        return;
      }
      if (kind === "video") uploadDialog.openVideoUpload(file);
      else uploadDialog.openGifUpload(file);
    };

    // window catches drops outside any page element (e.g. the gutters);
    // capture phase ensures we run before any per-page handler so the
    // browser's default file-open never wins.
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [signedIn, requireAuth, uploadDialog, t]);

  // Auto-dismiss the unsupported-type toast after a few seconds.
  useEffect(() => {
    if (!error) return;
    const handle = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(handle);
  }, [error]);

  return (
    <>
      {active && (
        <Box
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 10, 10, 0.78)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            // pointer-events: none so the underlying page still receives
            // dragover events bubbling up to the window listener — without
            // this the overlay would intercept and the drop coordinates
            // would be lost.
            pointerEvents: "none",
          }}
        >
          <Box
            style={{
              border: "2px dashed var(--accent-9)",
              borderRadius: 16,
              padding: "32px 40px",
              background: "var(--gray-1)",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
              maxWidth: 480,
              textAlign: "center",
            }}
          >
            <Flex direction="column" gap="2" align="center">
              <Heading size="5">{t("dropzone.title")}</Heading>
              <Text size="2" color="gray">
                {t("dropzone.hint")}
              </Text>
              {!signedIn && (
                <Text size="1" color="gray" style={{ marginTop: 4 }}>
                  {t("dropzone.signedOut")}
                </Text>
              )}
            </Flex>
          </Box>
        </Box>
      )}

      {error && (
        <Box
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 1001,
            minWidth: 280,
            maxWidth: 380,
          }}
        >
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        </Box>
      )}
    </>
  );
}
