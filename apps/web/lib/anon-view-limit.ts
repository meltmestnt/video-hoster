import { ANON_VIEW_LIMIT_ERROR_PREFIX } from "@repo/shared";

export type AnonViewLimitKind = "video" | "gif";

/**
 * Detects the API's "anonymous viewer hit the daily watch cap" error so the
 * SSR page can render a sign-up CTA instead of a notFound. The server emits
 * `ANON_VIEW_LIMIT:video|gif` from videos.byId / gifs.byId when an anon's
 * 24h distinct-target counter is full.
 */
export function parseAnonViewLimitError(
  err: unknown,
): AnonViewLimitKind | null {
  if (!err) return null;
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg !== "string") return null;
  if (!msg.startsWith(ANON_VIEW_LIMIT_ERROR_PREFIX)) return null;
  const kind = msg.slice(ANON_VIEW_LIMIT_ERROR_PREFIX.length);
  return kind === "video" || kind === "gif" ? kind : "video";
}
