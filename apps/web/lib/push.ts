"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

/**
 * Push subscription state machine. The browser Notification permission is
 * the source of truth for "are pushes allowed at all"; what the *server*
 * has stored is the source of truth for "are pushes wired up." We treat
 * both as required and surface a single combined status for UI.
 *
 * `unsupported` covers Safari < 16, in-app browsers, and any environment
 * without ServiceWorker + PushManager.
 */
export type PushStatus =
  | "unsupported"
  | "loading"
  | "blocked"
  | "default"
  | "subscribed";

const SW_PATH = "/sw.js";
const DISMISSED_KEY = "vidsandgifs:push-prompt-dismissed";

/** True when the platform exposes everything we need for Web Push. */
function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** url-base64 → Uint8Array, the encoding the W3C subscribe() requires. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/** Unwrap the keys the W3C PushSubscription returns into the plain
 *  base64-url strings web-push expects. The browser-side keys come back
 *  as ArrayBuffers; the server stores them as strings. */
function readKeys(sub: PushSubscription): { p256dh: string; auth: string } {
  const p256dh = sub.getKey("p256dh");
  const auth = sub.getKey("auth");
  if (!p256dh || !auth) {
    throw new Error("Push subscription missing keys");
  }
  const toBase64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return { p256dh: toBase64(p256dh), auth: toBase64(auth) };
}

export function usePushSubscription() {
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === "authenticated";

  const [status, setStatus] = useState<PushStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  // We fetch the public key only when we actually need it — bypassing
  // the server when push is unsupported saves a request on most mobile
  // Safari sessions.
  const publicKey = trpc.push.publicKey.useQuery(undefined, {
    enabled: signedIn && isPushSupported(),
    staleTime: 5 * 60 * 1000,
  });

  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();

  // Reconcile what the browser already has installed with our local
  // status flag. Runs on mount and whenever sign-in flips.
  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    if (!signedIn) {
      setStatus("default");
      return;
    }
    let cancelled = false;
    (async () => {
      const permission = Notification.permission;
      if (permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      if (sub && permission === "granted") {
        setStatus("subscribed");
      } else if (permission === "granted") {
        // Permission was granted in the past but the subscription is
        // missing (cleared cache, key rotated, etc.). Treat as default —
        // the user will re-tap to re-subscribe.
        setStatus("default");
      } else {
        setStatus("default");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!isPushSupported()) {
      setStatus("unsupported");
      return false;
    }
    if (!publicKey.data?.enabled || !publicKey.data.key) {
      setError("Push not configured on the server");
      return false;
    }

    try {
      // The two prerequisites have to land in this order: the SW must be
      // controlling the page before subscribe() can resolve, and the
      // permission prompt has to be triggered from a user gesture (this
      // function only ever runs from a click handler).
      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("blocked");
        return false;
      }
      if (permission !== "granted") {
        setStatus("default");
        return false;
      }

      // Replace any stale subscription on the same registration so the
      // server only ever holds the live keys. unsubscribe() is a no-op
      // if there's nothing there.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // The PushManager.subscribe BufferSource type was tightened in
        // TS 5.7 to require ArrayBuffer (not SharedArrayBuffer). Our
        // helper hands back a Uint8Array backed by a regular ArrayBuffer
        // so the cast is safe.
        applicationServerKey: urlBase64ToUint8Array(
          publicKey.data.key,
        ) as BufferSource,
      });
      const keys = readKeys(sub);
      await subscribeMutation.mutateAsync({
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });
      setStatus("subscribed");
      try {
        localStorage.removeItem(DISMISSED_KEY);
      } catch {
        /* private mode — fine */
      }
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  }, [publicKey.data, subscribeMutation]);

  const disable = useCallback(async (): Promise<void> => {
    setError(null);
    if (!isPushSupported()) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("default");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [unsubscribeMutation]);

  return {
    status,
    error,
    enable,
    disable,
    isBusy:
      subscribeMutation.isPending ||
      unsubscribeMutation.isPending ||
      status === "loading",
  };
}

export function readPushPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writePushPromptDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* private mode — fine */
  }
}
