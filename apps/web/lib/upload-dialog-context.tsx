"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { UploadDialog } from "@/components/UploadDialog";
import { GifUploadDialog } from "@/components/GifUploadDialog";

/**
 * Lifts the upload dialogs above per-page mounts so that any client-side
 * surface — TopBar, mobile drawer, drag-and-drop overlay — can pop them
 * with a single call. Without this, the drop overlay would have to ship its
 * own dialog instance and we'd lose the in-flight state when the user
 * dragged a file *while* the dialog was already open from the TopBar.
 */
interface UploadDialogContextValue {
  openVideoUpload: (file?: File | null) => void;
  openGifUpload: (file?: File | null) => void;
}

const Ctx = createContext<UploadDialogContextValue | null>(null);

export function UploadDialogProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const [videoOpen, setVideoOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  // Held separately from the open flag so that the file outlives the dialog
  // close transition — clearing it on close would race with the unmount.
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const pathname = usePathname();

  const openVideoUpload = useCallback((file?: File | null) => {
    setSeedFile(file ?? null);
    setVideoOpen(true);
  }, []);

  const openGifUpload = useCallback((file?: File | null) => {
    setSeedFile(file ?? null);
    setGifOpen(true);
  }, []);

  // Drop the seed when both dialogs are closed so a later open without a
  // file doesn't pick up a stale one.
  useEffect(() => {
    if (!videoOpen && !gifOpen) setSeedFile(null);
  }, [videoOpen, gifOpen]);

  // If the user navigates while a dialog is open, close it — matches the
  // existing TopBar behavior and avoids a lingering modal across routes.
  useEffect(() => {
    setVideoOpen(false);
    setGifOpen(false);
  }, [pathname]);

  const value = useMemo(
    () => ({ openVideoUpload, openGifUpload }),
    [openVideoUpload, openGifUpload],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {signedIn && (
        <>
          <UploadDialog
            open={videoOpen}
            onOpenChange={setVideoOpen}
            initialFile={videoOpen ? seedFile : null}
          />
          <GifUploadDialog
            open={gifOpen}
            onOpenChange={setGifOpen}
            initialFile={gifOpen ? seedFile : null}
          />
        </>
      )}
    </Ctx.Provider>
  );
}

export function useUploadDialog(): UploadDialogContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Outside the provider — used during SSR fallback or in places where
    // upload isn't available. Calls become no-ops rather than throwing.
    return { openVideoUpload: () => {}, openGifUpload: () => {} };
  }
  return ctx;
}
