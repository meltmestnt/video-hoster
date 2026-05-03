import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  issueLinkToken as issueToken,
  redeemLinkToken as redeemToken,
} from "@meltmestnt/vidsandgifs-crypto";
import { DiscordLink } from "./discord-link.entity";
import { LicenseService } from "../license/license.service";

@Injectable()
export class DiscordLinkService {
  private readonly logger = new Logger(DiscordLinkService.name);
  private readonly secret: string;

  constructor(
    @InjectRepository(DiscordLink)
    private readonly links: Repository<DiscordLink>,
    config: ConfigService,
    private readonly license: LicenseService,
  ) {
    // Reuse NEXTAUTH_SECRET like Telegram + media signing — already a
    // long random string, never shared with the client.
    this.secret = config.getOrThrow<string>("NEXTAUTH_SECRET");
  }

  /**
   * Mint a one-time HMAC token a website-signed-in user can paste
   * into the Discord bot via `/link code:<token>`. Actual packing
   * lives in @vidsandgifs/crypto — same shape as the Telegram link
   * token (28 bytes, 38 chars base64url) so the two services can
   * share that primitive.
   */
  issueLinkToken(userId: string): string {
    return issueToken({
      secret: this.secret,
      fingerprint: this.license.getFingerprint(),
      userId,
    });
  }

  /**
   * Verify a token from `/link code:<token>` and return the userId it
   * commits to, or null on tampering / expiry / malformed input.
   */
  redeemLinkToken(token: string): string | null {
    return redeemToken({
      secret: this.secret,
      fingerprint: this.license.getFingerprint(),
      token,
    });
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
