import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import webpush from "web-push";
import { PushSubscription } from "./push-subscription.entity";

/**
 * Payload shape that the service worker expects. Kept narrow so changes
 * stay backwards-compatible with already-installed SWs — adding a new
 * optional field is fine; renaming an existing one is not.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Server-relative URL for notificationclick to focus or open. */
  url: string;
  /** Optional small image (avatar) shown next to the body. */
  icon?: string | null;
  /** Stable string so a follow-up notification on the same subject
   *  replaces the previous one instead of stacking. */
  tag?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;
  private readonly publicKey: string;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subs: Repository<PushSubscription>,
    private readonly config: ConfigService,
  ) {
    const publicKey = this.config.get<string>("VAPID_PUBLIC_KEY") ?? "";
    const privateKey = this.config.get<string>("VAPID_PRIVATE_KEY") ?? "";
    const subject =
      this.config.get<string>("VAPID_SUBJECT") ??
      "mailto:admin@vidsandgifs.xyz";

    this.publicKey = publicKey;

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
      this.logger.log("Push notifications enabled (VAPID configured)");
    } else {
      this.enabled = false;
      this.logger.warn(
        "VAPID keys not set — push notifications will be silently dropped. " +
          "Generate with: npx web-push generate-vapid-keys",
      );
    }
  }

  /** Public VAPID key handed to the client so it can subscribe. */
  getPublicKey(): string {
    return this.publicKey;
  }

  /** True when the API is configured to actually send pushes. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Idempotent: if the same `endpoint` already exists for this user we update
   * the keys (the browser may rotate them on re-subscribe); if it exists for
   * a *different* user we move ownership to the new one — endpoints are
   * globally unique and one device only ever has one active subscription.
   */
  async upsert(args: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<void> {
    const existing = await this.subs.findOne({
      where: { endpoint: args.endpoint },
    });
    if (existing) {
      existing.userId = args.userId;
      existing.p256dh = args.p256dh;
      existing.auth = args.auth;
      existing.userAgent = args.userAgent;
      await this.subs.save(existing);
      return;
    }
    await this.subs.save(
      this.subs.create({
        userId: args.userId,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
      }),
    );
  }

  /** Remove the row identified by endpoint, regardless of which user owns
   *  it — endpoints are unique, so there is at most one. */
  async removeByEndpoint(endpoint: string): Promise<void> {
    await this.subs.delete({ endpoint });
  }

  /**
   * Fan out a single payload to every device the recipient has registered.
   * Failures on individual subscriptions don't abort the rest — and a 404
   * or 410 from the push service means that endpoint is permanently gone
   * (browser uninstalled, key rotated, etc.), so we drop it from the DB.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;
    const rows = await this.subs.find({ where: { userId } });
    if (rows.length === 0) return;

    const json = JSON.stringify(payload);
    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            json,
            { TTL: 60 * 60 * 24 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Endpoint is dead — purge it so we stop trying every time.
            await this.subs.delete({ id: row.id }).catch(() => {});
            return;
          }
          this.logger.warn(
            `Push send failed (status ${status ?? "?"}) for user ${userId}: ${
              (err as Error).message
            }`,
          );
        }
      }),
    );
  }
}
