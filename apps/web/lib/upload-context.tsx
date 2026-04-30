"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { compressTo480p } from "@/lib/compress-video";

// Cross-tab coordination: while one tab is uploading, every ~HEARTBEAT_MS it
// broadcasts its activity. Receiving tabs treat any heartbeat seen within
// LIVENESS_WINDOW_MS as an active upload elsewhere. This both signals the
// other tabs to disable their Upload button immediately and survives a tab
// crash without leaving the lock stuck — no message means it's stale.
const UPLOAD_CHANNEL = "video-upload-coordination";
const HEARTBEAT_MS = 2_500;
const LIVENESS_WINDOW_MS = 7_000;

type UploadBroadcast =
  | { kind: "started" | "heartbeat"; tabId: string; at: number }
  | { kind: "finished"; tabId: string };

export type UploadStatus =
  | "idle"
  | "compressing"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "error";

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  mimeType: string;
  visibility: "public" | "private";
}

export interface UploadSuccess {
  videoId: string;
  title: string;
}

interface UploadState {
  status: UploadStatus;
  fileName: string | null;
  videoId: string | null;
  progress: number;
  errorMessage: string | null;
  lastSuccess: UploadSuccess | null;
}

interface UploadContextValue extends UploadState {
  start: (file: File, meta: UploadMeta) => Promise<void>;
  reset: () => void;
  dismissSuccess: () => void;
  otherTabUploading: boolean;
}

const UploadContext = createContext<UploadContextValue | null>(null);

const initialState: UploadState = {
  status: "idle",
  fileName: null,
  videoId: null,
  progress: 0,
  errorMessage: null,
  lastSuccess: null,
};

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UploadState>(initialState);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const router = useRouter();
  const utils = trpc.useUtils();
  const createUpload = trpc.videos.createUpload.useMutation();
  const finalizeUpload = trpc.videos.finalizeUpload.useMutation();

  // Cross-tab coordination state.
  const tabIdRef = useRef<string>("");
  const channelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  // peerLastSeen: tabId -> timestamp of latest heartbeat we received.
  const peerLastSeenRef = useRef<Map<string, number>>(new Map());
  const [otherTabUploading, setOtherTabUploading] = useState(false);

  const recomputePeers = useCallback(() => {
    const now = Date.now();
    const peers = peerLastSeenRef.current;
    let live = false;
    for (const [id, at] of peers) {
      if (now - at > LIVENESS_WINDOW_MS) {
        peers.delete(id);
        continue;
      }
      live = true;
    }
    setOtherTabUploading(live);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const tabId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    tabIdRef.current = tabId;

    const channel = new BroadcastChannel(UPLOAD_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<UploadBroadcast>) => {
      const msg = event.data;
      if (!msg || msg.tabId === tabIdRef.current) return;
      if (msg.kind === "started" || msg.kind === "heartbeat") {
        peerLastSeenRef.current.set(msg.tabId, msg.at);
      } else if (msg.kind === "finished") {
        peerLastSeenRef.current.delete(msg.tabId);
      }
      recomputePeers();
    };

    // Sweep stale peers periodically — covers the case where the uploading
    // tab was closed without sending a "finished" message.
    const sweep = window.setInterval(recomputePeers, 1_500);

    return () => {
      window.clearInterval(sweep);
      channel.close();
      channelRef.current = null;
    };
  }, [recomputePeers]);

  const broadcast = useCallback((msg: UploadBroadcast) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) return;
    broadcast({ kind: "started", tabId: tabIdRef.current, at: Date.now() });
    heartbeatTimerRef.current = window.setInterval(() => {
      broadcast({ kind: "heartbeat", tabId: tabIdRef.current, at: Date.now() });
    }, HEARTBEAT_MS);
  }, [broadcast]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    broadcast({ kind: "finished", tabId: tabIdRef.current });
  }, [broadcast]);

  // Best-effort cleanup if the user closes/reloads the tab mid-upload.
  useEffect(() => {
    const onUnload = () => {
      if (heartbeatTimerRef.current !== null) {
        broadcast({ kind: "finished", tabId: tabIdRef.current });
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [broadcast]);

  const reset = useCallback(
    () => setState((s) => ({ ...initialState, lastSuccess: s.lastSuccess })),
    [],
  );

  const dismissSuccess = useCallback(
    () => setState((s) => ({ ...s, lastSuccess: null })),
    [],
  );

  const putToS3 = useCallback(
    (
      url: string,
      blob: Blob,
      contentType: string,
      onProgress?: (p: number) => void,
    ) =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && onProgress) {
            onProgress(ev.loaded / ev.total);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 PUT failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.send(blob);
      }),
    [],
  );

  const start = useCallback(
    async (file: File, meta: UploadMeta) => {
      if (otherTabUploading) {
        throw new Error(
          "Another tab is already uploading. Wait for that one to finish.",
        );
      }
      setState((s) => ({
        status: "compressing",
        fileName: file.name,
        videoId: null,
        progress: 0,
        errorMessage: null,
        lastSuccess: s.lastSuccess,
      }));
      startHeartbeat();

      try {
        // Client-side transcode to 480p H.264/AAC mp4. We upload the
        // compressed blob, not the original file, so S3 stores the smaller
        // version and the server's finalize step can skip its own re-encode.
        // If the in-browser ffmpeg run fails (OOM on large files, wasm load
        // failure, unsupported codec), we transparently fall back to
        // uploading the original and asking the server to re-encode.
        let payload: Blob = file;
        let payloadMime = (meta.mimeType as
          | "video/mp4"
          | "video/quicktime"
          | "video/webm"
          | "video/x-matroska");
        let compressServerSide = false;
        try {
          const compressed = await compressTo480p(file, {
            onProgress: (p) => setState((s) => ({ ...s, progress: p })),
          });
          payload = compressed;
          payloadMime = "video/mp4";
        } catch (compressErr) {
          console.warn(
            "Client-side video compression failed, falling back to server:",
            compressErr,
          );
          compressServerSide = true;
        }

        setState((s) => ({ ...s, status: "preparing", progress: 0 }));

        const created = await createUpload.mutateAsync({
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          mimeType: payloadMime,
          sizeBytes: payload.size,
          visibility: meta.visibility,
        });

        setState((s) => ({
          ...s,
          status: "uploading",
          videoId: created.videoId,
        }));

        await putToS3(created.uploadUrl, payload, payloadMime, (p) =>
          setState((s) => ({ ...s, progress: p })),
        );

        setState((s) => ({ ...s, status: "finalizing", progress: 1 }));
        await finalizeUpload.mutateAsync({
          videoId: created.videoId,
          compressServerSide,
        });

        await utils.videos.list.invalidate();
        router.refresh();
        setState({
          ...initialState,
          lastSuccess: { videoId: created.videoId, title: meta.title },
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage: (err as Error).message,
        }));
      } finally {
        xhrRef.current = null;
        stopHeartbeat();
      }
    },
    [
      createUpload,
      finalizeUpload,
      putToS3,
      router,
      utils.videos.list,
      otherTabUploading,
      startHeartbeat,
      stopHeartbeat,
    ],
  );

  const value = useMemo<UploadContextValue>(
    () => ({ ...state, start, reset, dismissSuccess, otherTabUploading }),
    [state, start, reset, dismissSuccess, otherTabUploading],
  );

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}

export const isUploadBusy = (status: UploadStatus): boolean =>
  status === "compressing" ||
  status === "preparing" ||
  status === "uploading" ||
  status === "finalizing";
