"use client";

import { UNVERIFIED_LIMIT_ERROR_PREFIX } from "@repo/shared";

export type UnverifiedLimitKind = "video" | "gif" | "screenshot";

/**
 * Pulls the unverified-limit kind out of an error message produced by the
 * API. Returns null if the error is something else.
 *
 * The server emits messages like `UNVERIFIED_LIMIT:video` so we can
 * differentiate between media kinds for the popup copy.
 */
export function parseUnverifiedLimitError(
  err: unknown,
): UnverifiedLimitKind | null {
  if (!err) return null;
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg !== "string") return null;
  if (!msg.startsWith(UNVERIFIED_LIMIT_ERROR_PREFIX)) return null;
  const kind = msg.slice(UNVERIFIED_LIMIT_ERROR_PREFIX.length);
  if (kind === "video" || kind === "gif" || kind === "screenshot") {
    return kind;
  }
  return "video";
}
