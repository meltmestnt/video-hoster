import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  ANON_DAILY_VIEW_LIMIT,
  ANON_VIEW_LIMIT_ERROR_PREFIX,
} from "@repo/shared";
import { enforceAnonView } from "./anon-view-limit";

// The bucket store is module-scoped and persists across tests. Using a
// unique IP per test (or per scenario) keeps tests independent without
// needing a reset hook on the module.
let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter % 250}-${Date.now()}`;

const VIDEO_ID = "v-id-";
const GIF_ID = "g-id-";

describe("enforceAnonView", () => {
  it("counts a brand-new view and returns newId=true", () => {
    const ip = freshIp();
    const state = enforceAnonView(ip, "video", `${VIDEO_ID}1`);
    expect(state).toEqual({
      count: 1,
      limit: ANON_DAILY_VIEW_LIMIT,
      newId: true,
    });
  });

  it("does not double-count the same target across reloads", () => {
    const ip = freshIp();
    enforceAnonView(ip, "video", `${VIDEO_ID}stable`);
    const state = enforceAnonView(ip, "video", `${VIDEO_ID}stable`);
    expect(state.count).toBe(1);
    expect(state.newId).toBe(false);
  });

  it("treats (kind, id) as the dedupe key — same id, different kind = two views", () => {
    const ip = freshIp();
    const id = "shared-id";
    const v = enforceAnonView(ip, "video", id);
    const g = enforceAnonView(ip, "gif", id);
    expect(v.count).toBe(1);
    expect(g.count).toBe(2);
    expect(g.newId).toBe(true);
  });

  it("isolates buckets across IPs", () => {
    const ipA = freshIp();
    const ipB = freshIp();
    enforceAnonView(ipA, "video", `${VIDEO_ID}a`);
    const state = enforceAnonView(ipB, "video", `${VIDEO_ID}b`);
    expect(state.count).toBe(1);
  });

  it(`throws once a fresh IP exceeds ANON_DAILY_VIEW_LIMIT (${ANON_DAILY_VIEW_LIMIT})`, () => {
    const ip = freshIp();
    for (let i = 0; i < ANON_DAILY_VIEW_LIMIT; i++) {
      enforceAnonView(ip, "video", `${VIDEO_ID}${i}`);
    }
    let thrown: unknown;
    try {
      enforceAnonView(ip, "video", `${VIDEO_ID}overflow`);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe("FORBIDDEN");
    expect((thrown as TRPCError).message).toBe(
      `${ANON_VIEW_LIMIT_ERROR_PREFIX}video`,
    );
  });

  it("uses the right kind suffix when throwing for a gif", () => {
    const ip = freshIp();
    for (let i = 0; i < ANON_DAILY_VIEW_LIMIT; i++) {
      enforceAnonView(ip, "video", `${VIDEO_ID}${i}`);
    }
    let thrown: unknown;
    try {
      enforceAnonView(ip, "gif", `${GIF_ID}1`);
    } catch (err) {
      thrown = err;
    }
    expect((thrown as TRPCError).message).toBe(
      `${ANON_VIEW_LIMIT_ERROR_PREFIX}gif`,
    );
  });

  it("re-views of an already-counted target keep working even after the cap is reached", () => {
    const ip = freshIp();
    for (let i = 0; i < ANON_DAILY_VIEW_LIMIT; i++) {
      enforceAnonView(ip, "video", `${VIDEO_ID}${i}`);
    }
    // The first id is already in the seen set, so re-watching it is a
    // free no-op even though new ids would be rejected.
    const state = enforceAnonView(ip, "video", `${VIDEO_ID}0`);
    expect(state.newId).toBe(false);
    expect(state.count).toBe(ANON_DAILY_VIEW_LIMIT);
  });

  it("returns the running count and limit on every successful call", () => {
    const ip = freshIp();
    const a = enforceAnonView(ip, "video", `${VIDEO_ID}1`);
    const b = enforceAnonView(ip, "video", `${VIDEO_ID}2`);
    const c = enforceAnonView(ip, "video", `${VIDEO_ID}3`);
    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
    expect(c.count).toBe(3);
    expect(c.limit).toBe(ANON_DAILY_VIEW_LIMIT);
  });
});
