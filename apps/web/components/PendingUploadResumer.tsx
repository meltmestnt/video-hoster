"use client";

import { Box, Callout } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import { useT } from "@/lib/i18n";
import {
  clearPendingUpload,
  getPendingUpload,
} from "@/lib/pending-upload";

/**
 * After sign-in, this checks IDB for a file the user dropped while logged
 * out and re-opens the matching upload dialog with the file pre-filled.
 *
 * Mounts only when signedIn=true so the very first poll already happens
 * inside an authenticated session — there's no race where we open a
 * dialog the user can't actually submit through.
 */
export function PendingUploadResumer() {
  const t = useT();
  const uploadDialog = useUploadDialog();
  const [resumed, setResumed] = useState(false);
  // Guard against StrictMode double-mounts and unrelated re-renders firing
  // the resume twice — once it's done for this session, it's done.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    (async () => {
      const pending = await getPendingUpload();
      if (cancelled || !pending) return;
      if (pending.kind === "video") {
        uploadDialog.openVideoUpload(pending.file);
      } else {
        uploadDialog.openGifUpload(pending.file);
      }
      await clearPendingUpload();
      setResumed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [uploadDialog]);

  useEffect(() => {
    if (!resumed) return;
    const handle = setTimeout(() => setResumed(false), 5000);
    return () => clearTimeout(handle);
  }, [resumed]);

  if (!resumed) return null;
  return (
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
      <Callout.Root color="iris">
        <Callout.Text>{t("dropzone.resumed")}</Callout.Text>
      </Callout.Root>
    </Box>
  );
}
