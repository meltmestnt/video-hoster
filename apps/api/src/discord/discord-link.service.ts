import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DiscordLink } from "./discord-link.entity";

// 15 minutes is enough for a user to copy the code from the website
// and run `/link` in Discord, including a slow phone-app-switching
// flow. Short enough that a leaked code is useless soon.
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class DiscordLinkService {
  private readonly logger = new Logger(DiscordLinkService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(DiscordLink)
    private readonly links: Repository<DiscordLink>,
    config: ConfigService,
  ) {
    // Reuse NEXTAUTH_SECRET like Telegram + media signing — already a
    // long random string, never shared with the client.
    this.secret = config.getOrThrow<string>("NEXTAUTH_SECRET");
  }

  /**
   * Mint a one-time HMAC token a website-signed-in user can paste into
   * the Discord bot via `/link code:<token>`. Same packing as the
   * Telegram link token: 16 bytes UUID + 4 bytes Unix-seconds expiry
   * + 8 bytes truncated HMAC = 28 bytes → 38 chars base64url.
   *
   * Discord's slash-command string options accept up to 6000 chars,
   * so we don't have Telegram's 64-char start-parameter ceiling — but
   * keeping the token short still helps mobile copy-paste UX.
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
   * Verify a token from `/link code:<token>` and return the userId it
   * commits to. Returns null on any tampering, expiry, or malformed
   * payload — caller surfaces a generic "expired or invalid" message
   * either way.
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
    discordUserId: string;
    userId: string;
    discordUsername: string | null;
  }): Promise<void> {
    // Replace any prior binding for this Discord user — switching
    // accounts should be a single `/link <new-code>` instead of
    // forcing an unlink first.
    await this.links.save({
      discordUserId: args.discordUserId,
      userId: args.userId,
      discordUsername: args.discordUsername,
    });
    this.logger.log(
      `discord.link ok discordUserId=${args.discordUserId} userId=${args.userId}`,
    );
  }

  findByDiscordUserId(
    discordUserId: string,
  ): Promise<DiscordLink | null> {
    return this.links.findOne({ where: { discordUserId } });
  }

  findByUserId(userId: string): Promise<DiscordLink | null> {
    return this.links.findOne({ where: { userId } });
  }

  async unlinkByUserId(userId: string): Promise<void> {
    await this.links.delete({ userId });
  }

  async unlinkByDiscordUserId(discordUserId: string): Promise<void> {
    await this.links.delete({ discordUserId });
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
