import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/headers before importing server.ts. We replace cookies()
// and headers() with controllable stubs so the test can simulate any
// combination of cookie + Accept-Language without needing a real
// request context.
type CookieStore = {
  get: (name: string) => { value: string } | undefined;
};
type HeaderStore = {
  get: (name: string) => string | null;
};

let cookieStore: CookieStore;
let headerStore: HeaderStore;

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

const fakeCookies = (vh?: string): CookieStore => ({
  get: (name: string) =>
    name === "vh.locale" && vh ? { value: vh } : undefined,
});
const fakeHeaders = (
  acceptLanguage?: string,
  override?: string,
): HeaderStore => ({
  get: (name: string) => {
    const lower = name.toLowerCase();
    if (lower === "accept-language") return acceptLanguage ?? null;
    if (lower === "x-locale-override") return override ?? null;
    return null;
  },
});

// Import lazily so the mocked next/headers is in place first.
let getServerLocale: typeof import("./server").getServerLocale;

beforeEach(async () => {
  cookieStore = fakeCookies();
  headerStore = fakeHeaders();
  ({ getServerLocale } = await import("./server"));
});
afterEach(() => {
  vi.resetModules();
});

describe("getServerLocale", () => {
  it("falls back to 'en' when there's no cookie and no Accept-Language", async () => {
    expect(await getServerLocale()).toBe("en");
  });

  it("respects the vh.locale cookie when set to a supported value", async () => {
    cookieStore = fakeCookies("uk");
    expect(await getServerLocale()).toBe("uk");
  });

  it("ignores an unsupported cookie value and falls through to negotiation", async () => {
    cookieStore = fakeCookies("ja");
    headerStore = fakeHeaders("uk-UA,uk;q=0.9");
    expect(await getServerLocale()).toBe("uk");
  });

  it("ignores a non-string cookie value defensively", async () => {
    cookieStore = fakeCookies(""); // empty string
    headerStore = fakeHeaders("en-US");
    expect(await getServerLocale()).toBe("en");
  });

  it("cookie wins over Accept-Language when both are supported", async () => {
    cookieStore = fakeCookies("en");
    headerStore = fakeHeaders("uk-UA,uk;q=1.0");
    expect(await getServerLocale()).toBe("en");
  });

  it("negotiates from a simple Accept-Language: en-US", async () => {
    headerStore = fakeHeaders("en-US,en;q=0.9");
    expect(await getServerLocale()).toBe("en");
  });

  it("negotiates from Accept-Language: uk-UA", async () => {
    headerStore = fakeHeaders("uk-UA,uk;q=0.9,en;q=0.5");
    expect(await getServerLocale()).toBe("uk");
  });

  it("respects q-weight ordering when picking among supported tags", async () => {
    // ja and ru aren't supported; en (q=0.5) should win over them, but
    // the highest-q supported tag is uk so uk wins outright.
    headerStore = fakeHeaders("ja;q=1.0,uk;q=0.8,en;q=0.5");
    expect(await getServerLocale()).toBe("uk");
  });

  it("falls back to 'en' when only unsupported languages are listed", async () => {
    headerStore = fakeHeaders("ja,zh-CN,fr;q=0.5");
    expect(await getServerLocale()).toBe("en");
  });

  it("matches by primary subtag (en-GB → en)", async () => {
    headerStore = fakeHeaders("en-GB");
    expect(await getServerLocale()).toBe("en");
  });

  it("ignores malformed q values and treats them as q=1", async () => {
    // 'q=banana' is malformed; the parser leaves it at q=1, so the tag
    // still ranks at default weight.
    headerStore = fakeHeaders("uk;q=banana");
    expect(await getServerLocale()).toBe("uk");
  });

  it("strips empty entries / extra whitespace gracefully", async () => {
    headerStore = fakeHeaders("  ,, en-US , , uk;q=0.9 ");
    expect(await getServerLocale()).toBe("en");
  });

  it("treats an empty Accept-Language value as missing", async () => {
    headerStore = fakeHeaders("");
    expect(await getServerLocale()).toBe("en");
  });

  it("x-locale-override header wins over cookie and Accept-Language", async () => {
    cookieStore = fakeCookies("en");
    headerStore = fakeHeaders("en-US,en;q=0.9", "uk");
    expect(await getServerLocale()).toBe("uk");
  });

  it("ignores an unsupported x-locale-override value", async () => {
    cookieStore = fakeCookies("en");
    headerStore = fakeHeaders(undefined, "ja");
    expect(await getServerLocale()).toBe("en");
  });
});
