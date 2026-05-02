import { describe, expect, it, beforeEach, vi } from "vitest";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { rateLimit } from "./rate-limit";

// We exercise rateLimit through a tiny tRPC router so the assertions
// match how it's actually used at the call site (middleware -> next).
// Each test uses unique procedure names so the in-memory bucket store
// doesn't leak counts across tests.

const t = initTRPC.context<Context>().create();

interface CallArgs {
  ip?: string;
  userId?: string;
}

function buildCtx({ ip = "1.2.3.4", userId }: CallArgs = {}): Context {
  // We only need fields that rateLimit reads. The full Context type is
  // strict, so cast through unknown — services are never touched.
  return {
    ip,
    user: userId ? ({ id: userId } as Context["user"]) : null,
    services: {} as Context["services"],
  };
}

let suiteId = 0;
function uniqueName(): string {
  return `t${++suiteId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows the first N hits within a window", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "ip", max: 3, windowMs: 60_000 }))
      .query(() => "ok");
    const caller = t.router({ x: proc }).createCaller(buildCtx());
    expect(await caller.x()).toBe("ok");
    expect(await caller.x()).toBe("ok");
    expect(await caller.x()).toBe("ok");
  });

  it("rejects the (max+1)th hit with TOO_MANY_REQUESTS", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "ip", max: 2, windowMs: 60_000 }))
      .query(() => "ok");
    const caller = t.router({ x: proc }).createCaller(buildCtx());
    await caller.x();
    await caller.x();
    let thrown: unknown;
    try {
      await caller.x();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    expect((thrown as TRPCError).message).toMatch(/Try again in/);
  });

  it("isolates buckets per IP under keyBy='ip'", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "ip", max: 1, windowMs: 60_000 }))
      .query(() => "ok");
    const router = t.router({ x: proc });
    const a = router.createCaller(buildCtx({ ip: "9.9.9.1" }));
    const b = router.createCaller(buildCtx({ ip: "9.9.9.2" }));
    await a.x();
    // b is on a different IP, so its first call should still pass even
    // though a has already used up its quota.
    await expect(b.x()).resolves.toBe("ok");
    await expect(a.x()).rejects.toThrow(/Try again in/);
  });

  it("isolates buckets per userId under keyBy='userId'", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "userId", max: 1, windowMs: 60_000 }))
      .query(() => "ok");
    const router = t.router({ x: proc });
    const a = router.createCaller(buildCtx({ userId: "u-a" }));
    const b = router.createCaller(buildCtx({ userId: "u-b" }));
    await a.x();
    await expect(b.x()).resolves.toBe("ok");
    await expect(a.x()).rejects.toThrow(/Try again in/);
  });

  it("falls back to ip when keyBy='userId' but the call is anonymous", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "userId", max: 1, windowMs: 60_000 }))
      .query(() => "ok");
    const router = t.router({ x: proc });
    // Two anon callers from the same IP should share a bucket.
    const a = router.createCaller(buildCtx({ ip: "9.9.9.10" }));
    const b = router.createCaller(buildCtx({ ip: "9.9.9.10" }));
    await a.x();
    await expect(b.x()).rejects.toThrow(/Try again in/);
  });

  it("isolates buckets per procedure name even with same key/window", async () => {
    const nameA = uniqueName();
    const nameB = uniqueName();
    const router = t.router({
      a: t.procedure
        .use(rateLimit({ name: nameA, keyBy: "ip", max: 1, windowMs: 60_000 }))
        .query(() => "a"),
      b: t.procedure
        .use(rateLimit({ name: nameB, keyBy: "ip", max: 1, windowMs: 60_000 }))
        .query(() => "b"),
    });
    const c = router.createCaller(buildCtx({ ip: "9.9.9.20" }));
    await c.a();
    // Same IP, but procedure name is part of the bucket key → independent.
    await expect(c.b()).resolves.toBe("b");
  });

  it("reports retry-after seconds rounded up", async () => {
    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "ip", max: 1, windowMs: 5_000 }))
      .query(() => "ok");
    const caller = t.router({ x: proc }).createCaller(
      buildCtx({ ip: "9.9.9.30" }),
    );
    await caller.x();
    let thrown: unknown;
    try {
      await caller.x();
    } catch (err) {
      thrown = err;
    }
    const m = (thrown as TRPCError).message.match(/Try again in (\d+)s\./);
    expect(m).not.toBeNull();
    const secs = Number(m![1]);
    // We just consumed the bucket, so retry-after should be roughly the
    // full window (5s) — give a tolerance for clock jitter.
    expect(secs).toBeGreaterThanOrEqual(1);
    expect(secs).toBeLessThanOrEqual(5);
  });

  it("releases quota after the window slides past with fake timers", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2030-01-01T00:00:00Z");
    vi.setSystemTime(t0);

    const name = uniqueName();
    const proc = t.procedure
      .use(rateLimit({ name, keyBy: "ip", max: 1, windowMs: 1_000 }))
      .query(() => "ok");
    const caller = t.router({ x: proc }).createCaller(
      buildCtx({ ip: "9.9.9.40" }),
    );

    await caller.x();
    await expect(caller.x()).rejects.toThrow(/Try again in/);

    // Advance past the window so the old hit drops out of the bucket.
    vi.setSystemTime(new Date(t0.getTime() + 1_500));
    await expect(caller.x()).resolves.toBe("ok");
  });
});
