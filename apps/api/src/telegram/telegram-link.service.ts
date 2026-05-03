import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  issueLinkToken as issueToken,
  redeemLinkToken as redeemToken,
} from "@vidsandgifs/crypto";
import { TelegramLink } from "./telegram-link.entity";
import { LicenseService } from "../license/license.service";

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(TelegramLink)
    private readonly links: Repository<TelegramLink>,
    config: ConfigService,
    private readonly license: LicenseService,
  ) {
    // Reuse NEXTAUTH_SECRET like the media-signing flow does — it's already
    // a long random string and isn't shared with the client.
    this.secret = config.getOrThrow<string>("NEXTAUTH_SECRET");
  }

  /**
   * Mint a one-time HMAC token that proves "this Telegram user, on
   * `/start <token>`, is acting on behalf of the userId baked into the
   * token". The actual packing lives in @vidsandgifs/crypto — this
   * service just couples it to the Telegram link table.
   */
  issueLinkToken(userId: string): string {
    return issueToken({
      secret: this.secret,
      fingerprint: this.license.getFingerprint(),
      userId,
    });
  }

  /**
   * Verify a token from `/start <token>` and return the userId it
   * commits to, or null on any tampering / expiry / malformed input.
   */
  redeemLinkToken(token: string): string | null {
    return redeemToken({
      secret: this.secret,
      fingerprint: this.license.getFingerprint(),
      token,
    });
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
}
