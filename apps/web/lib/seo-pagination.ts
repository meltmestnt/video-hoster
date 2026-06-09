import { SEO_PAGE_MAX } from "@repo/shared";

// Per-list page size used by the /videos, /gifs, and /all grids and by
// sitemap.ts when it enumerates ?page=N URLs. Must match the `limit`
// passed to videos.list / gifs.list when SSR seeds the listing.
export const LISTING_PAGE_LIMIT = 20;

// Parse a ?page= value into a 1..SEO_PAGE_MAX page number, defaulting to
// 1 for anything malformed. Anything above SEO_PAGE_MAX is clamped down
// rather than 400'd: the route handler relies on the API to flag the
// page as out-of-range via an empty result and emit noindex.
export function parsePageParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return 1;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(SEO_PAGE_MAX, Math.floor(n));
}

// Build a clean `path?page=N` URL. Page 1 collapses to the bare path so
// `/gifs` is the canonical landing instead of `/gifs?page=1`.
export function buildPagedUrl(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}
