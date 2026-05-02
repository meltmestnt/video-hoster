import { describe, expect, it, beforeEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";
import { AuthService } from "./auth.service";

const SECRET = "test-secret-please-do-not-use-in-prod";
const SECRET_BYTES = new TextEncoder().encode(SECRET);
const ISS = "vidsandgifs-web";
const AUD = "vidsandgifs-api";

function fakeConfig(secret = SECRET): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === "NEXTAUTH_SECRET") return secret;
      throw new Error(`Unexpected config key ${key}`);
    },
  } as unknown as ConfigService;
}

async function mintToken(
  overrides: {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string | null;
    provider?: string;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    secret?: Uint8Array;
  } = {},
): Promise<string> {
  const builder = new SignJWT({
    email: overrides.email ?? "user@example.com",
    name: overrides.name ?? "Test User",
    picture: overrides.picture ?? null,
    provider: overrides.provider ?? "google",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(overrides.sub ?? "user-id-1")
    .setIssuer(overrides.issuer ?? ISS)
    .setAudience(overrides.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? "1h");
  return builder.sign(overrides.secret ?? SECRET_BYTES);
}

describe("AuthService.verifyToken", () => {
  let svc: AuthService;
  beforeEach(() => {
    svc = new AuthService(fakeConfig());
  });

  it("returns the verified payload for a well-formed Google-provider token", async () => {
    const token = await mintToken({
      sub: "u1",
      email: "Alice@example.com",
      name: "Alice",
      picture: "https://example.com/a.jpg",
      provider: "google",
    });
    expect(await svc.verifyToken(token)).toEqual({
      sub: "u1",
      email: "Alice@example.com",
      name: "Alice",
      picture: "https://example.com/a.jpg",
      provider: "google",
    });
  });

  it("treats provider=credentials explicitly", async () => {
    const token = await mintToken({ provider: "credentials" });
    const verified = await svc.verifyToken(token);
    expect(verified.provider).toBe("credentials");
  });

  it("defaults provider to 'google' when the claim is missing or unknown", async () => {
    const token = await mintToken({ provider: "unknown-provider" });
    expect((await svc.verifyToken(token)).provider).toBe("google");
  });

  it("normalizes a missing picture claim to null", async () => {
    // SignJWT preserves the explicit null we set in mintToken, so this
    // exercises the same branch as a token where picture is absent.
    const token = await mintToken({ picture: null });
    expect((await svc.verifyToken(token)).picture).toBeNull();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await mintToken({
      secret: new TextEncoder().encode("a-different-secret"),
    });
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token with the wrong issuer (cross-environment leak)", async () => {
    const token = await mintToken({ issuer: "some-other-app" });
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await mintToken({ audience: "vidsandgifs-admin" });
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an expired token", async () => {
    // jose accepts negative durations as past expirations.
    const token = await mintToken({ expiresIn: "-1s" });
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token missing required claims (no email)", async () => {
    // Build a token that's correctly signed but with email omitted.
    const token = await new SignJWT({ name: "Bob", provider: "google" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(SECRET_BYTES);
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token missing required claims (no sub)", async () => {
    const token = await new SignJWT({
      email: "u@x.co",
      name: "Bob",
      provider: "google",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(SECRET_BYTES);
    await expect(svc.verifyToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an arbitrary garbage string", async () => {
    await expect(svc.verifyToken("not-a-jwt")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token signed with a different algorithm (e.g., none)", async () => {
    // Build an unsigned-style token (alg=none) — jose refuses by default.
    const fakeToken =
      "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." +
      Buffer.from(
        JSON.stringify({
          sub: "u1",
          email: "a@b",
          name: "x",
          iss: ISS,
          aud: AUD,
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      ).toString("base64url") +
      ".";
    await expect(svc.verifyToken(fakeToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
