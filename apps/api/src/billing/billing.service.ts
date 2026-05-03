import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createCheckout,
  getSubscription,
  lemonSqueezySetup,
} from "@lemonsqueezy/lemonsqueezy.js";
import {
  SubscriptionStatus,
  SubscriptionTier,
  User,
} from "../users/user.entity";
import { ProcessedWebhookEvent } from "./processed-webhook-event.entity";

const WEBHOOK_PROVIDER = "lemonsqueezy";

// Subset of LS webhook events we react to. Everything else is ignored.
const TRACKED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
]);

interface LSSubscriptionAttributes {
  customer_id: number;
  status:
    | "on_trial"
    | "active"
    | "paused"
    | "past_due"
    | "unpaid"
    | "cancelled"
    | "expired";
  renews_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  urls: {
    update_payment_method?: string;
    customer_portal?: string;
    customer_portal_update_subscription?: string;
  };
}

interface LSWebhookPayload {
  meta: {
    event_name: string;
    // LemonSqueezy stamps a unique webhook_id on every delivery. Same
    // event re-delivered (their retry, our 5xx, or a captured replay)
    // carries the same id, which we use as the idempotency key.
    webhook_id?: string;
    event_id?: string;
    custom_data?: Record<string, string>;
  };
  data: {
    type: string;
    id: string;
    attributes: LSSubscriptionAttributes;
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly storeId: string;
  private readonly proVariantId: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ProcessedWebhookEvent)
    private readonly processedEvents: Repository<ProcessedWebhookEvent>,
  ) {
    lemonSqueezySetup({
      apiKey: config.getOrThrow<string>("LEMONSQUEEZY_API_KEY"),
      onError: (err) => {
        this.logger.error(
          `LemonSqueezy SDK error: ${(err as Error).message ?? err}`,
        );
      },
    });
    this.storeId = config.getOrThrow<string>("LEMONSQUEEZY_STORE_ID");
    this.proVariantId = config.getOrThrow<string>(
      "LEMONSQUEEZY_PRO_VARIANT_ID",
    );
    this.webhookSecret = config.getOrThrow<string>(
      "LEMONSQUEEZY_WEBHOOK_SECRET",
    );
  }

  /**
   * Verify the X-Signature header against the raw body. LemonSqueezy uses
   * HMAC-SHA256 (no timestamp), so we compare digests directly.
   */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    // Sanity check the format up front. The header from LS is always lower-
    // hex of the right length; arbitrary unicode in the parameter would
    // make the Buffer compare misbehave (e.g. multi-byte chars distorting
    // length) and constant-time comparisons aren't constant-time on inputs
    // that fail the precondition.
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const digest = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    return timingSafeEqual(
      Buffer.from(digest, "hex"),
      Buffer.from(signature, "hex"),
    );
  }

  parsePayload(rawBody: Buffer): LSWebhookPayload {
    return JSON.parse(rawBody.toString("utf8")) as LSWebhookPayload;
  }

  async createCheckoutSession(args: {
    userId: string;
    successUrl: string;
  }): Promise<{ url: string }> {
    const user = await this.users.findOne({ where: { id: args.userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.subscriptionTier === "pro" && user.subscriptionStatus === "active") {
      throw new BadRequestException("You're already on the Pro plan");
    }

    const { data, error } = await createCheckout(
      this.storeId,
      this.proVariantId,
      {
        checkoutData: {
          email: user.email,
          name: user.name,
          // LS echoes custom_data on every webhook event — useful as a
          // backup linkage if we ever miss the customer FK on first sync.
          custom: { user_id: user.id },
        },
        productOptions: { redirectUrl: args.successUrl },
        checkoutOptions: { embed: false },
      },
    );
    if (error) {
      throw new Error(`LemonSqueezy createCheckout failed: ${error.message}`);
    }
    const url = data?.data?.attributes?.url;
    if (!url) throw new Error("LemonSqueezy checkout returned no URL");
    this.logger.log(
      `billing.createCheckoutSession ok userId=${args.userId}`,
    );
    return { url };
  }

  /**
   * "Manage subscription" portal. LS scopes portal URLs per-subscription,
   * so we look up the current sub and read the URL off its attributes.
   */
  async getPortalUrl(args: { userId: string }): Promise<{ url: string }> {
    const user = await this.users.findOne({ where: { id: args.userId } });
    if (!user) throw new NotFoundException("User not found");
    if (!user.lemonSubscriptionId) {
      throw new BadRequestException("No subscription on file");
    }
    const { data, error } = await getSubscription(user.lemonSubscriptionId);
    if (error) {
      throw new Error(`LemonSqueezy getSubscription failed: ${error.message}`);
    }
    const urls = data?.data?.attributes?.urls ?? {};
    const url = urls.customer_portal ?? urls.update_payment_method;
    if (!url) throw new Error("LemonSqueezy returned no portal URL");
    this.logger.log(
      `billing.createPortalSession ok userId=${args.userId}`,
    );
    return { url };
  }

  async handleEvent(payload: LSWebhookPayload): Promise<void> {
    const eventName = payload.meta.event_name;
    const subId = payload.data?.id;
    this.logger.log(
      `billing.webhook event=${eventName} subscriptionId=${subId ?? "null"} status=${payload.data?.attributes?.status ?? "null"}`,
    );
    if (!TRACKED_EVENTS.has(eventName)) return;
    if (payload.data.type !== "subscriptions") return;

    // Idempotency check. LemonSqueezy retries failed webhook deliveries
    // and a captured "active" payload could otherwise be replayed after
    // cancellation to restore Pro for free. Insert-then-catch on the
    // unique (provider, eventId) index is race-safe across concurrent
    // deliveries: only the first commit wins.
    const eventId = payload.meta.webhook_id ?? payload.meta.event_id;
    if (eventId) {
      try {
        await this.processedEvents.insert({
          provider: WEBHOOK_PROVIDER,
          eventId,
          eventName,
        });
      } catch (err) {
        // Postgres unique-violation is "23505". Anything else is genuinely
        // a server problem and should bubble up so LS retries.
        const code = (err as { code?: string }).code;
        if (code === "23505") {
          this.logger.log(
            `billing.webhook duplicate event=${eventName} eventId=${eventId} — skipping`,
          );
          return;
        }
        throw err;
      }
    } else {
      // Defense-in-depth: LS has always sent an id, but if it ever stops
      // we'd silently lose idempotency without noticing. Log loudly so we
      // catch the format change in time.
      this.logger.warn(
        `billing.webhook event=${eventName} arrived without webhook_id/event_id — idempotency skipped`,
      );
    }

    const attrs = payload.data.attributes;
    const customerId = String(attrs.customer_id);
    const userId = payload.meta.custom_data?.user_id;

    // Prefer the customer FK when we already have it; on first event we
    // fall back to the user_id passed through checkout custom_data and
    // record the customerId so future events use the FK directly.
    let user = await this.users.findOne({
      where: { lemonCustomerId: customerId },
    });
    if (!user && userId) {
      user = await this.users.findOne({ where: { id: userId } });
      if (user) {
        await this.users.update(
          { id: user.id },
          { lemonCustomerId: customerId },
        );
        user.lemonCustomerId = customerId;
      }
    }
    if (!user) {
      this.logger.warn(
        `Webhook for unknown LS customer ${customerId} / user ${userId} — ignoring`,
      );
      return;
    }

    const status = mapStatus(attrs.status);
    const tier: SubscriptionTier =
      status === "active" || status === "trialing" ? "pro" : "free";
    const periodEnd = attrs.renews_at
      ? new Date(attrs.renews_at)
      : attrs.ends_at
        ? new Date(attrs.ends_at)
        : null;

    await this.users.update(
      { id: user.id },
      {
        lemonSubscriptionId: subId,
        subscriptionTier: tier,
        subscriptionStatus: status,
        subscriptionPeriodEnd: periodEnd,
      },
    );
    this.logger.log(
      `Synced sub ${subId} for user ${user.id}: ${tier}/${status} (event=${eventName})`,
    );
  }
}

function mapStatus(s: LSSubscriptionAttributes["status"]): SubscriptionStatus {
  switch (s) {
    case "on_trial":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "cancelled":
    case "expired":
      return "canceled";
    case "paused":
    case "unpaid":
    default:
      return "inactive";
  }
}
