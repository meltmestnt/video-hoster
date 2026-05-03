import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createHash,
  createPublicKey,
  verify as verifyEd,
} from "node:crypto";

/**
 * Ed25519 public key for vidsandgifs deployment licenses.
 *
 * The private half lives outside the repo (default
 * `~/.vidsandgifs/license-key.pem`) and is never committed. Anyone
 * cloning this repo can READ this public key, but cannot use it to
 * mint a valid license — that's what asymmetric crypto gets us.
 *
 * Replace the value below with your own public key. Generate the
 * keypair once with:
 *
 *   mkdir -p ~/.vidsandgifs
 *   openssl genpkey -algorithm ed25519 \
 *     -out ~/.vidsandgifs/license-key.pem
 *   openssl pkey -in ~/.vidsandgifs/license-key.pem -pubout
 *
 * Paste the printed public key (everything between the BEGIN and END
 * lines, inclusive) here.
 *
 * Rotation: bumping this constant invalidates every existing
 * VIDSANDGIFS_LICENSE that was signed against the old private key.
 * Plan a re-mint pass before any rotation.
 */
const VIDSANDGIFS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATKS1IzhRuiNKeyCSp5v9ZKoQgNTq6wCy44Um+OWyav8=
-----END PUBLIC KEY-----`;

interface LicensePayload {
  /** Hostname of the deployment this license authorizes. */
  domain: string;
  /** Issued-at timestamp in Unix seconds (informational). */
  issuedAt?: number;
}

export interface LoadedLicense {
  domain: string;
  /**
   * Stable 16-char hash of the license payload. Folded into HMAC keys
   * across MediaService, TelegramLinkService, DiscordLinkService — so
   * a clone that bypasses the license check ends up with a different
   * fingerprint and silently breaks every URL + link token it signs.
   */
  fingerprint: string;
}

/**
 * Loads + verifies the deployment license at boot. Refuses to start
 * the api in production without a valid license whose `domain` field
 * matches the configured `WEB_ORIGIN`. In development, missing /
 * invalid licenses log a warning and fall back to a placeholder
 * fingerprint so local dev never depends on signing key access.
 */
@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenseService.name);
  private loaded: LoadedLicense | null = null;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    const isProd =
      (this.config.get<string>("NODE_ENV") ?? "development") === "production";
    try {
      this.loaded = this.parseAndVerify(isProd);
      this.logger.log(
        `license loaded domain=${this.loaded.domain} fingerprint=${this.loaded.fingerprint}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      if (isProd) {
        // Refuse to start in prod — this is the production gate. The
        // exception bubbles up through Nest's bootstrap and the
        // process exits.
        throw new Error(`License check failed: ${message}`);
      }
      this.logger.warn(
        `license check failed in development: ${message}. Falling back to placeholder fingerprint — URLs signed in this run will only verify locally.`,
      );
      this.loaded = { domain: "dev-fallback", fingerprint: "dev" };
    }
  }

  /**
   * Stable hash of the license payload. Folded into the HMAC key for
   * media URL signing + the Telegram/Discord link tokens. Bypassing
   * the license check at boot collapses this to "dev" and breaks
   * every signed artifact the cloned service produces.
   */
  getFingerprint(): string {
    if (!this.loaded) {
      // onApplicationBootstrap not yet run — caller is using the
      // license too early. Fail loudly because silently using "dev"
      // here would let production sign things with the wrong key.
      throw new Error("License not loaded — call after Nest bootstrap");
    }
    return this.loaded.fingerprint;
  }

  getDomain(): string {
    if (!this.loaded) {
      throw new Error("License not loaded — call after Nest bootstrap");
    }
    return this.loaded.domain;
  }

  private parseAndVerify(enforceDomain: boolean): LoadedLicense {
    const raw = this.config.get<string>("VIDSANDGIFS_LICENSE");
    if (!raw) throw new Error("VIDSANDGIFS_LICENSE env var is not set");

    const parts = raw.split(".");
    if (parts.length !== 2) {
      throw new Error('VIDSANDGIFS_LICENSE must be in "<payload>.<signature>" format');
    }
    const [payloadB64, sigB64] = parts;

    let payloadBuf: Buffer;
    let signature: Buffer;
    try {
      payloadBuf = Buffer.from(payloadB64, "base64url");
      signature = Buffer.from(sigB64, "base64url");
    } catch {
      throw new Error("License is not valid base64url");
    }

    let publicKey;
    try {
      publicKey = createPublicKey(VIDSANDGIFS_PUBLIC_KEY);
    } catch {
      throw new Error(
        "VIDSANDGIFS_PUBLIC_KEY constant is not a valid PEM public key — see the comment above the constant for setup instructions",
      );
    }

    const valid = verifyEd(null, payloadBuf, publicKey, signature);
    if (!valid) {
      throw new Error("License signature does not verify against the embedded public key");
    }

    let decoded: LicensePayload;
    try {
      decoded = JSON.parse(payloadBuf.toString());
    } catch {
      throw new Error("License payload is not valid JSON");
    }
    if (typeof decoded.domain !== "string" || !decoded.domain) {
      throw new Error("License payload is missing domain");
    }

    if (enforceDomain) {
      const webOrigin = this.config.get<string>("WEB_ORIGIN");
      if (!webOrigin) {
        throw new Error("WEB_ORIGIN env var must be set in production");
      }
      let actualHost: string;
      try {
        actualHost = new URL(webOrigin).hostname;
      } catch {
        throw new Error(`WEB_ORIGIN="${webOrigin}" is not a valid URL`);
      }
      if (decoded.domain !== actualHost) {
        throw new Error(
          `license signed for "${decoded.domain}" but deployment is "${actualHost}"`,
        );
      }
    }

    // Fingerprint = first 16 hex chars of SHA-256 over the encoded
    // payload. Stable across reboots, deterministic per license. Short
    // enough to keep HMAC keys readable in logs without leaking secrets.
    const fingerprint = createHash("sha256")
      .update(payloadB64)
      .digest("hex")
      .slice(0, 16);

    return { domain: decoded.domain, fingerprint };
  }
}
