import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pack/unpack for the Telegram + Discord account-link tokens.
 *
 * Format (28 bytes total → 38 chars base64url):
 *   • 16 bytes — userId UUID, raw bytes
 *   • 4 bytes  — Unix-seconds expiry (good through 2106)
 *   • 8 bytes  — HMAC-SHA-256 truncated to 8 bytes
 *
 * Telegram's `start=<param>` deep link caps at 64 characters and the
 * earlier text-encoded form (uuid.exp.fullSig → ~154 chars base64url)
 * silently overflowed it, dropping the payload during the deep-link
 * round-trip. This compact binary form fits comfortably under that
 * cap — 8 bytes of HMAC truncation gives 2^64 second-preimage
 * resistance, which is plenty for a 15-min one-time token.
 *
 * The fingerprint is mixed into the HMAC key the same way the media
 * signer uses it — bypassing the license-loader in the api breaks
 * every existing link token's verification simultaneously.
 */
const TOKEN_TTL_MS = 15 * 60 * 1000;

export interface IssueLinkTokenArgs {
  secret: string;
  fingerprint: string;
  userId: string;
}

export function issueLinkToken(args: IssueLinkTokenArgs): string {
  const userBytes = uuidToBytes(args.userId);
  const exp = Math.floor((Date.now() + TOKEN_TTL_MS) / 1000);
  const expBuf = Buffer.alloc(4);
  expBuf.writeUInt32BE(exp);
  const head = Buffer.concat([userBytes, expBuf]);
  const sig = createHmac("sha256", `${args.secret}:${args.fingerprint}`)
    .update(head)
    .digest()
    .subarray(0, 8);
  return Buffer.concat([head, sig]).toString("base64url");
}

export interface RedeemLinkTokenArgs {
  secret: string;
  fingerprint: string;
  token: string;
}

/**
 * Verify a token and return the embedded userId, or null on any
 * tampering / expiry / malformed input. Caller surfaces a generic
 * "expired or invalid" message either way.
 */
export function redeemLinkToken(args: RedeemLinkTokenArgs): string | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(args.token, "base64url");
  } catch {
    return null;
  }
  if (buf.length !== 28) return null;
  const head = buf.subarray(0, 20);
  const userBytes = head.subarray(0, 16);
  const expSeconds = head.readUInt32BE(16);
  if (expSeconds * 1000 < Date.now()) return null;
  const expectedSig = createHmac("sha256", `${args.secret}:${args.fingerprint}`)
    .update(head)
    .digest()
    .subarray(0, 8);
  const gotSig = buf.subarray(20);
  if (expectedSig.length !== gotSig.length) return null;
  if (!timingSafeEqual(expectedSig, gotSig)) return null;
  return bytesToUuid(userBytes);
}

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`uuidToBytes: invalid UUID "${uuid}"`);
  }
  return Buffer.from(hex, "hex");
}

function bytesToUuid(buf: Buffer): string {
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
