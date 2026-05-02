import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Repository } from "typeorm";
import { createHmac } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { createMockRepo } from "../../test/mock-repo";

// Mock the lemonsqueezy SDK before importing BillingService so the
// real module's network calls never fire in tests.
vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  lemonSqueezySetup: vi.fn(),
  createCheckout: vi.fn(),
  getSubscription: vi.fn(),
}));

import { BillingService } from "./billing.service";
import {
  createCheckout,
  getSubscription,
} from "@lemonsqueezy/lemonsqueezy.js";
import type { User } from "../users/user.entity";

const SECRET = "ls-webhook-secret";

function fakeConfig(): ConfigService {
  const env: Record<string, string> = {
    LEMONSQUEEZY_API_KEY: "ls-api-key",
    LEMONSQUEEZY_STORE_ID: "store-1",
    LEMONSQUEEZY_PRO_VARIANT_ID: "variant-1",
    LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
  };
  return {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`Missing ${key}`);
      return env[key];
    },
  } as unknown as ConfigService;
}

function makeSvc() {
  const users = createMockRepo<User>();
  const svc = new BillingService(
    fakeConfig(),
    users as unknown as Repository<User>,
  );
  return { svc, users };
}

function signedDigest(body: Buffer): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("BillingService.verifySignature", () => {
  it("returns false when the signature header is missing", () => {
    const { svc } = makeSvc();
    expect(svc.verifySignature(Buffer.from("hi"), undefined)).toBe(false);
  });

  it("returns false when the signature isn't 64 hex chars", () => {
    const { svc } = makeSvc();
    // Wrong length
    expect(svc.verifySignature(Buffer.from("hi"), "abc")).toBe(false);
    // Right length but non-hex
    expect(
      svc.verifySignature(Buffer.from("hi"), "z".repeat(64)),
    ).toBe(false);
    // Right length, partial hex but contains an out-of-range char
    expect(
      svc.verifySignature(Buffer.from("hi"), "g".repeat(64)),
    ).toBe(false);
  });

  it("returns true for a correctly-signed body", () => {
    const { svc } = makeSvc();
    const body = Buffer.from('{"hello":"world"}');
    expect(svc.verifySignature(body, signedDigest(body))).toBe(true);
  });

  it("returns false when the signature is for a different body", () => {
    const { svc } = makeSvc();
    const goodBody = Buffer.from('{"hello":"world"}');
    const badSig = signedDigest(Buffer.from("totally different bytes"));
    expect(svc.verifySignature(goodBody, badSig)).toBe(false);
  });

  it("accepts uppercase hex (some libs uppercase the digest)", () => {
    const { svc } = makeSvc();
    const body = Buffer.from("payload");
    const upper = signedDigest(body).toUpperCase();
    expect(svc.verifySignature(body, upper)).toBe(true);
  });
});

describe("BillingService.parsePayload", () => {
  it("decodes a UTF-8 JSON buffer", () => {
    const { svc } = makeSvc();
    const buf = Buffer.from(
      JSON.stringify({ meta: { event_name: "x" }, data: { id: "1" } }),
    );
    const parsed = svc.parsePayload(buf);
    expect(parsed.meta.event_name).toBe("x");
    expect(parsed.data.id).toBe("1");
  });

  it("throws on malformed JSON", () => {
    const { svc } = makeSvc();
    expect(() => svc.parsePayload(Buffer.from("not json"))).toThrow();
  });
});

describe("BillingService.handleEvent", () => {
  function payload(overrides: Partial<{
    event: string;
    type: string;
    customerId: string | number;
    userId: string;
    status: string;
    renewsAt: string | null;
    endsAt: string | null;
    subId: string;
  }> = {}) {
    // Use `key in overrides` rather than `??` so an explicit null in
    // a test (i.e. "the LS payload genuinely had no renews_at") isn't
    // silently replaced by the default.
    const renewsAt =
      "renewsAt" in overrides ? overrides.renewsAt : "2026-12-31T00:00:00Z";
    const endsAt = "endsAt" in overrides ? overrides.endsAt : null;
    return {
      meta: {
        event_name: overrides.event ?? "subscription_updated",
        custom_data: overrides.userId ? { user_id: overrides.userId } : undefined,
      },
      data: {
        type: overrides.type ?? "subscriptions",
        id: overrides.subId ?? "sub-1",
        attributes: {
          customer_id: overrides.customerId ?? 999,
          status: overrides.status ?? "active",
          renews_at: renewsAt,
          ends_at: endsAt,
          trial_ends_at: null,
          urls: {},
        },
      },
    } as unknown as Parameters<BillingService["handleEvent"]>[0];
  }

  it("ignores untracked events", async () => {
    const { svc, users } = makeSvc();
    await svc.handleEvent(payload({ event: "order_created" }));
    expect(users.findOne).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it("ignores non-subscription event types", async () => {
    const { svc, users } = makeSvc();
    await svc.handleEvent(payload({ type: "orders" }));
    expect(users.update).not.toHaveBeenCalled();
  });

  it("skips with a warning when no user can be linked", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValue(null);
    await svc.handleEvent(payload());
    expect(users.update).not.toHaveBeenCalled();
  });

  it("updates the user when found by lemonCustomerId", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonCustomerId: "999",
    } as User);
    await svc.handleEvent(payload({ customerId: 999 }));
    expect(users.update).toHaveBeenCalledWith(
      { id: "u-1" },
      expect.objectContaining({
        lemonSubscriptionId: "sub-1",
        subscriptionTier: "pro",
        subscriptionStatus: "active",
      }),
    );
  });

  it("falls back to userId from custom_data on first event, then backfills lemonCustomerId", async () => {
    const { svc, users } = makeSvc();
    // First lookup by customer id misses; second by user id hits.
    users.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "u-1",
        lemonCustomerId: null,
      } as unknown as User);
    await svc.handleEvent(
      payload({ customerId: "c-7", userId: "u-1" }),
    );
    // Backfill happens before the main update — assert both mutations.
    const calls = users.update.mock.calls;
    expect(calls[0]).toEqual([{ id: "u-1" }, { lemonCustomerId: "c-7" }]);
    expect(calls[1][0]).toEqual({ id: "u-1" });
    expect(calls[1][1]).toMatchObject({
      lemonSubscriptionId: "sub-1",
      subscriptionTier: "pro",
    });
  });

  it.each([
    ["on_trial", "trialing", "pro"],
    ["active", "active", "pro"],
    ["past_due", "past_due", "free"],
    ["cancelled", "canceled", "free"],
    ["expired", "canceled", "free"],
    ["paused", "inactive", "free"],
    ["unpaid", "inactive", "free"],
  ])(
    "maps LS status %s → tier=%s status=%s",
    async (lsStatus, expectedStatus, expectedTier) => {
      const { svc, users } = makeSvc();
      users.findOne.mockResolvedValueOnce({
        id: "u-1",
        lemonCustomerId: "999",
      } as User);
      await svc.handleEvent(payload({ status: lsStatus }));
      const [, patch] = users.update.mock.calls[0] as [unknown, unknown];
      expect(patch).toMatchObject({
        subscriptionStatus: expectedStatus,
        subscriptionTier: expectedTier,
      });
    },
  );

  it("uses ends_at when renews_at is missing", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonCustomerId: "999",
    } as User);
    await svc.handleEvent(
      payload({
        renewsAt: null,
        endsAt: "2027-01-01T00:00:00Z",
        status: "cancelled",
      }),
    );
    const [, patch] = users.update.mock.calls[0] as [unknown, { subscriptionPeriodEnd: Date | null }];
    expect(patch.subscriptionPeriodEnd).toBeInstanceOf(Date);
    expect((patch.subscriptionPeriodEnd as Date).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("sets periodEnd=null when neither renews_at nor ends_at is supplied", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonCustomerId: "999",
    } as User);
    await svc.handleEvent(
      payload({ renewsAt: null, endsAt: null, status: "expired" }),
    );
    const [, patch] = users.update.mock.calls[0] as [
      unknown,
      { subscriptionPeriodEnd: Date | null },
    ];
    expect(patch.subscriptionPeriodEnd).toBeNull();
  });
});

describe("BillingService.createCheckoutSession", () => {
  beforeEach(() => {
    vi.mocked(createCheckout).mockReset();
  });

  it("404s when the user doesn't exist", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.createCheckoutSession({
        userId: "u-1",
        successUrl: "https://x/y",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("400s when the user already has an active Pro plan (no SDK call)", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      email: "x@y.co",
      name: "X",
      subscriptionTier: "pro",
      subscriptionStatus: "active",
    } as User);
    await expect(
      svc.createCheckoutSession({
        userId: "u-1",
        successUrl: "https://x/y",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("returns the checkout URL when the SDK responds OK", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      email: "x@y.co",
      name: "X",
      subscriptionTier: "free",
      subscriptionStatus: "inactive",
    } as User);
    vi.mocked(createCheckout).mockResolvedValue({
      data: { data: { attributes: { url: "https://ls/checkout/123" } } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof createCheckout>>);
    const out = await svc.createCheckoutSession({
      userId: "u-1",
      successUrl: "https://x/y",
    });
    expect(out).toEqual({ url: "https://ls/checkout/123" });
  });

  it("propagates an SDK error as a thrown error", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      email: "x@y.co",
      name: "X",
      subscriptionTier: "free",
      subscriptionStatus: "inactive",
    } as User);
    vi.mocked(createCheckout).mockResolvedValue({
      data: null,
      error: { message: "store closed" },
    } as unknown as Awaited<ReturnType<typeof createCheckout>>);
    await expect(
      svc.createCheckoutSession({
        userId: "u-1",
        successUrl: "https://x/y",
      }),
    ).rejects.toThrow(/store closed/);
  });
});

describe("BillingService.getPortalUrl", () => {
  beforeEach(() => {
    vi.mocked(getSubscription).mockReset();
  });

  it("404s when the user doesn't exist", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    await expect(svc.getPortalUrl({ userId: "u-1" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("400s when the user has no subscription on file", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonSubscriptionId: null,
    } as unknown as User);
    await expect(svc.getPortalUrl({ userId: "u-1" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("returns the customer_portal URL when present", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonSubscriptionId: "sub-1",
    } as User);
    vi.mocked(getSubscription).mockResolvedValue({
      data: {
        data: {
          attributes: {
            urls: { customer_portal: "https://ls/portal/xyz" },
          },
        },
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof getSubscription>>);
    expect(await svc.getPortalUrl({ userId: "u-1" })).toEqual({
      url: "https://ls/portal/xyz",
    });
  });

  it("falls back to update_payment_method when customer_portal is absent", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({
      id: "u-1",
      lemonSubscriptionId: "sub-1",
    } as User);
    vi.mocked(getSubscription).mockResolvedValue({
      data: {
        data: {
          attributes: {
            urls: { update_payment_method: "https://ls/pay/xyz" },
          },
        },
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof getSubscription>>);
    expect(await svc.getPortalUrl({ userId: "u-1" })).toEqual({
      url: "https://ls/pay/xyz",
    });
  });
});
