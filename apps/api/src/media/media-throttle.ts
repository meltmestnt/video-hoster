import { HttpException, HttpStatus } from "@nestjs/common";
import {
  MEDIA_DAILY_BYTES_PER_IP,
  MEDIA_REQUESTS_PER_MINUTE_PER_IP,
} from "@repo/shared";

export type MediaThrottleReason = "media-rate-limit" | "media-bytes-cap";

export class MediaThrottleException extends HttpException {
  constructor(
    public readonly reason: MediaThrottleReason,
    message: string,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Bucket {
  // Recent request timestamps (ms) — sorted ascending, trimmed lazily.
  reqs: number[];
  // (timestamp, bytes) hits in the last 24h.
  bytes: Array<{ at: number; size: number }>;
}

const buckets = new Map<string, Bucket>();
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

const getBucket = (ip: string): Bucket => {
  const b = buckets.get(ip) ?? { reqs: [], bytes: [] };
  // LRU bump so eviction prefers truly idle IPs.
  buckets.delete(ip);
  buckets.set(ip, b);
  return b;
};

export interface MediaThrottleState {
  reqsInWindow: number;
  bytesInWindow: number;
  reqLimit: number;
  bytesLimit: number;
}

/**
 * Enforces both throttles for a /media/ request:
 *   1. Rolling 60s req cap per IP — stops the scrape-loop attack.
 *   2. Rolling 24h byte cap per IP — actual wallet protection against
 *      a botnet sharing one signed URL.
 *
 * Counts the bytes the response *advertises* (Content-Length), not bytes
 * actually streamed. Conservative on purpose — if a client aborts after
 * one byte we still count the chunk as "served" for budgeting, since S3
 * already started shipping bytes by then.
 */
export function enforceMediaThrottle(
  ip: string,
  bytes: number,
): MediaThrottleState {
  const now = Date.now();
  const bucket = getBucket(ip);

  const reqCutoff = now - MIN_MS;
  while (bucket.reqs.length > 0 && bucket.reqs[0] <= reqCutoff) {
    bucket.reqs.shift();
  }
  const byteCutoff = now - DAY_MS;
  while (bucket.bytes.length > 0 && bucket.bytes[0].at <= byteCutoff) {
    bucket.bytes.shift();
  }

  if (bucket.reqs.length >= MEDIA_REQUESTS_PER_MINUTE_PER_IP) {
    const retryAfterMs = bucket.reqs[0] + MIN_MS - now;
    throw new MediaThrottleException(
      "media-rate-limit",
      `Too many media requests. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
    );
  }

  const usedBytes = bucket.bytes.reduce((sum, b) => sum + b.size, 0);
  if (usedBytes + bytes > MEDIA_DAILY_BYTES_PER_IP) {
    throw new MediaThrottleException(
      "media-bytes-cap",
      "Daily media bandwidth limit reached for your IP. Try again later.",
    );
  }

  bucket.reqs.push(now);
  bucket.bytes.push({ at: now, size: bytes });
  evictIfNeeded();

  return {
    reqsInWindow: bucket.reqs.length,
    bytesInWindow: usedBytes + bytes,
    reqLimit: MEDIA_REQUESTS_PER_MINUTE_PER_IP,
    bytesLimit: MEDIA_DAILY_BYTES_PER_IP,
  };
}
