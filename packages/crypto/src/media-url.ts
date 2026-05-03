import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC sign + verify for media URLs. The recipe is intentionally
 * trivial — `kind|id|exp` HMAC'd with `secret:fingerprint` — but the
 * `fingerprint` half is what makes a clone-without-license-check
 * cascade. The license-loader in the public api binds fingerprint to
 * the deployment domain via Ed25519, so anyone bypassing the check
 * ends up with an empty / placeholder fingerprint and every URL the
 * cloned service signs uses a different HMAC than the original.
 *
 * Format kept stable so existing signed URLs cached on Telegram /
 * Discord / Cloudflare CDN still verify after a deploy. If you ever
 * need to rotate the format (compromise, etc.), bump CACHEABLE_BUCKET
 * downstream so old URLs invalidate cleanly.
 */
export interface SignMediaUrlArgs {
  /** NEXTAUTH_SECRET, the long-lived shared signing key. */
  secret: string;
  /** Stable hash of the deployment license — see LicenseService. */
  fingerprint: string;
  kind: string;
  id: string;
  /** Unix-millis expiry. */
  exp: number;
}

export interface VerifyMediaUrlArgs extends SignMediaUrlArgs {
  sig: string;
}

export function signMediaUrl(args: SignMediaUrlArgs): string {
  return createHmac("sha256", `${args.secret}:${args.fingerprint}`)
    .update(`${args.kind}|${args.id}|${args.exp}`)
    .digest("hex");
}

/**
 * Returns true on a valid signature, false otherwise. Constant-time
 * compare — the caller throws the auth error.
 */
export function verifyMediaUrl(args: VerifyMediaUrlArgs): boolean {
  const expected = Buffer.from(signMediaUrl(args), "utf8");
  const got = Buffer.from(args.sig, "utf8");
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}
