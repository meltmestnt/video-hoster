"use client";

import {
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
} from "@repo/shared";

export type UnverifiedLimitKind = "video" | "gif" | "screenshot" | "action";

function parseLimitError(
  err: unknown,
  prefix: string,
): UnverifiedLimitKind | null {
  if (!err) return null;
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg !== "string") return null;
  if (!msg.startsWith(prefix)) return null;
  const kind = msg.slice(prefix.length);
  if (kind === "video" || kind === "gif" || kind === "screenshot") {
    return kind;
  }
  return "video";
}

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
  return parseLimitError(err, UNVERIFIED_LIMIT_ERROR_PREFIX);
}

/**
 * Same shape as the unverified parser, but for the verified-but-not-yet-
 * approved daily caps. Server emits `UNAPPROVED_LIMIT:video|gif|screenshot`
 * when an unapproved account hits its daily cap so the client can pop a
 * "waiting on admin approval" dialog.
 */
export function parseUnapprovedLimitError(
  err: unknown,
): UnverifiedLimitKind | null {
  return parseLimitError(err, UNAPPROVED_LIMIT_ERROR_PREFIX);
}
