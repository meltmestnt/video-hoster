"use client";

import {
  ALLOWED_AUDIO_MIME_TYPES,
  type AllowedAudioMimeType,
} from "@repo/shared";

export function isAllowedAudioMime(
  mime: string,
): mime is AllowedAudioMimeType {
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * Probe an audio file's duration via a transient `<audio>` element. Resolves
 * to null when the browser can't decode it — the caller treats that as
 * "duration unknown" instead of failing the upload.
 */
export function probeAudioDuration(file: File | Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("audio");
    const cleanup = () => URL.revokeObjectURL(url);
    a.preload = "metadata";
    a.src = url;
    a.addEventListener(
      "loadedmetadata",
      () => {
        const d = a.duration;
        cleanup();
        resolve(Number.isFinite(d) && d > 0 ? d : null);
      },
      { once: true },
    );
    a.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
  });
}

export function formatDuration(s: number | null | undefined): string {
  if (!s || !Number.isFinite(s) || s <= 0) return "—";
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
