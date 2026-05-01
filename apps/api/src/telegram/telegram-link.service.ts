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
   */
  issueLinkToken(userId: string): string {
    const exp = Date.now() + LINK_TOKEN_TTL_MS;
    const payload = `${userId}.${exp}`;
    const sig = this.sign(payload);
    // base64url so it survives Telegram's deep-link query encoding without
    // any percent-mangling — `t.me/bot?start=<token>` only allows
    // [A-Za-z0-9_-].
    return Buffer.from(`${payload}.${sig}`, "utf8").toString("base64url");
  }

  /**
   * Verify a token from `/start <token>` and return the userId it commits
   * to. Returns null on any tampering, expiry, or malformed payload —
   * caller surfaces a generic "expired or invalid" message either way.
   */
  redeemLinkToken(token: string): string | null {
    let raw: string;
    try {
      raw = Buffer.from(token, "base64url").toString("utf8");
    } catch {
      return null;
    }
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const [userId, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp < Date.now()) return null;
    const expected = Buffer.from(this.sign(`${userId}.${expRaw}`), "utf8");
    const got = Buffer.from(sig, "utf8");
    if (expected.length !== got.length) return null;
    if (!timingSafeEqual(expected, got)) return null;
    return userId;
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
