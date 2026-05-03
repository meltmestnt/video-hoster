import { TRPCError, initTRPC } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

interface Bucket {
  // Sorted timestamps (ms since epoch) of recent hits, trimmed lazily on
  // each check.
  hits: number[];
}

// In-memory store. Single-instance only — if the API is ever scaled
// horizontally, swap this for Redis (rate-limiter-flexible has a drop-in
// Redis backend). State resets on every deploy, which is fine: an attacker
// has no way to predict the reset, and Railway redeploys are infrequent.
const buckets = new Map<string, Bucket>();

// Soft cap so a hostile actor cycling through IPs can't grow the Map
// unbounded. When we cross this size, drop the oldest-touched buckets.
const MAX_BUCKETS = 50_000;

const evictIfNeeded = () => {
  if (buckets.size <= MAX_BUCKETS) return;
  // The Map preserves insertion order, so the first keys are the oldest
  // ones we haven't refreshed. Trim ~10% in one pass.
  const toDrop = Math.floor(MAX_BUCKETS * 0.1);
  let dropped = 0;
  for (const key of buckets.keys()) {
    if (dropped >= toDrop) break;
    buckets.delete(key);
    dropped++;
  }
};

export interface RateLimitOpts {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per window. */
  max: number;
  /** Bucket key strategy. */
  keyBy: "ip" | "userId";
  /** Logical name — included in the bucket key so different procedures
   *  with the same window/max don't share counters. */
  name: string;
}

/**
 * Low-level bucket check, callable both from the middleware below and
 * from inside resolvers that need to rate-limit on a value pulled from
 * the validated input (e.g. an email on the sign-in handler that the
 * middleware can't see yet). Throws TOO_MANY_REQUESTS when the bucket
 * is over budget.
 */
export const enforceRateLimit = (
  key: string,
  max: number,
  windowMs: number,
): void => {
  const now = Date.now();
  const cutoff = now - windowMs;
  const bucket = buckets.get(key) ?? { hits: [] };

  let firstLive = 0;
  while (firstLive < bucket.hits.length && bucket.hits[firstLive] <= cutoff) {
    firstLive++;
  }
  if (firstLive > 0) bucket.hits.splice(0, firstLive);

  if (bucket.hits.length >= max) {
    const retryAfterMs = bucket.hits[0] + windowMs - now;
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
    });
  }

  bucket.hits.push(now);
  // Map keeps insertion order — `set` on an existing key does NOT refresh
  // its position, so the eviction sweep would happily drop hot keys.
  // Delete then set bumps the key to the most-recent slot, giving us
  // proper LRU eviction.
  buckets.delete(key);
  buckets.set(key, bucket);
  evictIfNeeded();
};

export const rateLimit = (opts: RateLimitOpts) =>
  t.middleware(({ ctx, next }) => {
    const id =
      opts.keyBy === "userId"
        ? ctx.user?.id ?? `ip:${ctx.ip}`
        : ctx.ip;
    const key = `${opts.name}:${opts.keyBy}:${id}`;
    enforceRateLimit(key, opts.max, opts.windowMs);
    return next();
  });
