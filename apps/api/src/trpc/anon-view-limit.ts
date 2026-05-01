import { TRPCError } from "@trpc/server";
import {
  ANON_DAILY_VIEW_LIMIT,
  ANON_VIEW_LIMIT_ERROR_PREFIX,
} from "@repo/shared";

type Kind = "video" | "gif";

interface Bucket {
  // (kind:id) keys → first-seen timestamp. We use a Map so each distinct
  // target counts once; reloads of the same video don't burn quota.
  seen: Map<string, number>;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const buckets = new Map<string, Bucket>();

// Same eviction strategy as the tRPC rate-limiter: cap the number of
// tracked IPs so a hostile actor cycling through proxies can't grow the
// Map without bound.
const MAX_BUCKETS = 50_000;

const evictIfNeeded = () => {
  if (buckets.size <= MAX_BUCKETS) return;
  const toDrop = Math.floor(MAX_BUCKETS * 0.1);
  let dropped = 0;
  for (const key of buckets.keys()) {
    if (dropped >= toDrop) break;
    buckets.delete(key);
    dropped++;
  }
};

const expire = (bucket: Bucket, now: number) => {
  const cutoff = now - WINDOW_MS;
  for (const [key, at] of bucket.seen) {
    if (at <= cutoff) bucket.seen.delete(key);
  }
};

export interface AnonViewState {
  count: number;
  limit: number;
  newId: boolean;
}

/**
 * Records an anonymous view of (kind, id) from the given IP and decides
 * whether it should be allowed. Returns the post-decision state for the
 * caller to log. Throws a TRPCError with the stable
 * `ANON_VIEW_LIMIT:` message prefix when the cap is hit.
 *
 * Same-target re-views in the 24h window are free — they neither count
 * toward the cap nor get rejected, so reload-on-the-same-page works.
 */
export function enforceAnonView(
  ip: string,
  kind: Kind,
  id: string,
): AnonViewState {
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { seen: new Map() };
  expire(bucket, now);

  const targetKey = `${kind}:${id}`;
  const alreadySeen = bucket.seen.has(targetKey);

  if (!alreadySeen && bucket.seen.size >= ANON_DAILY_VIEW_LIMIT) {
    // Re-insert anyway? No — leaving the bucket alone means a denied
    // attacker doesn't grow the Map further. Still bump position so the
    // bucket isn't dropped before its window expires.
    buckets.delete(ip);
    buckets.set(ip, bucket);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${ANON_VIEW_LIMIT_ERROR_PREFIX}${kind}`,
    });
  }

  bucket.seen.set(targetKey, now);
  // LRU bump so eviction prefers genuinely-stale IPs.
  buckets.delete(ip);
  buckets.set(ip, bucket);
  evictIfNeeded();

  return {
    count: bucket.seen.size,
    limit: ANON_DAILY_VIEW_LIMIT,
    newId: !alreadySeen,
  };
}
