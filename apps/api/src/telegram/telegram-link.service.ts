import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { TelegramLink } from "./telegram-link.entity";

// 15 minutes is enough time to click a deep link from the website and
// land in the bot. Long enough that a slow phone-switching flow doesn't
// expire mid-redirect; short enough that a leaked token is useless soon.
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(TelegramLink)
    private readonly links: Repository<TelegramLink>,
    config: ConfigService,
  ) {
    // Reuse NEXTAUTH_SECRET like the media-signing flow does — it's already
    // a long random string and isn't shared with the client.
    this.secret = config.getOrThrow<string>("NEXTAUTH_SECRET");
  }

  /**
   * Mint a one-time HMAC token that proves "this Telegram user, on `/start
   * <token>`, is acting on behalf of the userId baked into the token". No
   * DB roundtrip needed for issuance or redemption — the signature is the
   * proof, the embedded expiry is the TTL.
   *
   * Token packing fits inside Telegram's 64-character `start=<param>` cap:
   *   • 16 bytes — userId UUID, parsed to its raw bytes
   *   • 4 bytes  — Unix seconds expiry (good through 2106)
   *   • 8 bytes  — HMAC-SHA-256 truncated to 8 bytes (2^64 second-preimage
   *                resistance; for a 15-min one-time token, plenty)
   * Total 28 bytes → 38 chars base64url. The previous text-encoded form
   * (uuid.exp.fullSig → ~154 chars base64url) overflowed Telegram's
   * limit, which silently dropped the payload on the deep-link
   * round-trip — the bot kept seeing /start with no args.
   */
  issueLinkToken(userId: string): string {
    const userBytes = uuidToBytes(userId);
    const exp = Math.floor((Date.now() + LINK_TOKEN_TTL_MS) / 1000);
    const expBuf = Buffer.alloc(4);
    expBuf.writeUInt32BE(exp);
    const head = Buffer.concat([userBytes, expBuf]);
    const sig = createHmac("sha256", this.secret)
      .update(head)
      .digest()
      .subarray(0, 8);
    return Buffer.concat([head, sig]).toString("base64url");
  }

  /**
   * Verify a token from `/start <token>` and return the userId it commits
   * to. Returns null on any tampering, expiry, or malformed payload —
   * caller surfaces a generic "expired or invalid" message either way.
   */
  redeemLinkToken(token: string): string | null {
    let buf: Buffer;
    try {
      buf = Buffer.from(token, "base64url");
    } catch {
      return null;
    }
    if (buf.length !== 28) return null;
    const head = buf.subarray(0, 20);
    const userBytes = head.subarray(0, 16);
    const expSeconds = head.readUInt32BE(16);
    if (expSeconds * 1000 < Date.now()) return null;
    const expectedSig = createHmac("sha256", this.secret)
      .update(head)
      .digest()
      .subarray(0, 8);
    const gotSig = buf.subarray(20);
    if (expectedSig.length !== gotSig.length) return null;
    if (!timingSafeEqual(expectedSig, gotSig)) return null;
    return bytesToUuid(userBytes);
  }

  async link(args: {
    telegramUserId: string;
    userId: string;
    telegramUsername: string | null;
  }): Promise<void> {
    // Replace any prior binding for this Telegram user — switching accounts
    // should be a one-step `/start <new-token>` instead of "unlink first".
    await this.links.save({
      telegramUserId: args.telegramUserId,
      userId: args.userId,
      telegramUsername: args.telegramUsername,
    });
    this.logger.log(
      `telegram.link ok telegramUserId=${args.telegramUserId} userId=${args.userId}`,
    );
  }

  findByTelegramUserId(
    telegramUserId: string,
  ): Promise<TelegramLink | null> {
    return this.links.findOne({ where: { telegramUserId } });
  }

  findByUserId(userId: string): Promise<TelegramLink | null> {
    return this.links.findOne({ where: { userId } });
  }

  async unlinkByUserId(userId: string): Promise<void> {
    await this.links.delete({ userId });
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret)
      .update(payload)
      .digest("hex");
  }
}

/** Parse a UUID into its 16 raw bytes — TypeORM hands us UUIDs as the
 *  canonical hyphenated string. Strips the hyphens and decodes the
 *  resulting 32 hex chars. Throws on a malformed UUID, which would only
 *  ever come from a corrupted DB row. */
function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`uuidToBytes: invalid UUID "${uuid}"`);
  }
  return Buffer.from(hex, "hex");
}

/** Inverse of uuidToBytes — formats 16 bytes back into the canonical
 *  8-4-4-4-12 hex layout. */
function bytesToUuid(buf: Buffer): string {
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
