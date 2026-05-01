import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verifies a Google Identity Services ID token (the "credential" returned
 * by One Tap) against Google's published JWKS.
 *
 * Google rotates signing keys, so we let `jose` cache and refresh the JWKS
 * automatically; the same JWKS instance is reused across calls so we don't
 * hit Google's certs endpoint per sign-in.
 */
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const ALLOWED_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
  emailVerified: boolean;
}

export async function verifyGoogleIdToken(
  credential: string,
  audience: string,
): Promise<GoogleIdTokenPayload | null> {
  if (!credential || !audience) return null;
  try {
    const { payload } = await jwtVerify(credential, JWKS, {
      issuer: ALLOWED_ISSUERS,
      audience,
      algorithms: ["RS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const name =
      typeof payload.name === "string" && payload.name.length > 0
        ? payload.name
        : email;
    if (!sub || !email || !name) return null;
    const picture =
      typeof payload.picture === "string" ? payload.picture : null;
    // Google sets email_verified=true for any account that has confirmed
    // ownership of the address. We refuse unverified ones — without it a
    // user could claim somebody else's email address by signing up to
    // Google with it but never confirming.
    const emailVerified = payload.email_verified === true;
    if (!emailVerified) return null;
    return { sub, email, name, picture, emailVerified };
  } catch {
    return null;
  }
}
