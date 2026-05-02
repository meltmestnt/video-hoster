import { describe, expect, it } from "vitest";
import {
  fetchRemoteMedia,
  isPublicAddress,
  RemoteFetchError,
} from "./url-fetcher";

describe("isPublicAddress — IPv4", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.0", // just outside RFC 1918
    "100.63.255.255", // just outside CGN
    "100.128.0.0", // just outside CGN
    "172.15.255.255", // just outside RFC 1918
  ])("accepts public %s", (addr) => {
    expect(isPublicAddress(addr)).toBe(true);
  });

  it.each([
    // loopback
    "127.0.0.1",
    "127.255.255.255",
    // unspecified / "this network"
    "0.0.0.0",
    // RFC 1918
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.255.255",
    // link-local incl. cloud metadata
    "169.254.169.254",
    "169.254.0.1",
    // Azure WireServer
    "168.63.129.16",
    // CGN
    "100.64.0.1",
    "100.127.255.255",
    // benchmark
    "198.18.0.1",
    "198.19.255.255",
    // docs / TEST-NET
    "192.0.0.0",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    // multicast
    "224.0.0.1",
    "239.255.255.255",
    // reserved + broadcast
    "240.0.0.0",
    "255.255.255.255",
  ])("refuses non-public %s", (addr) => {
    expect(isPublicAddress(addr)).toBe(false);
  });
});

describe("isPublicAddress — IPv6", () => {
  it.each([
    "2606:4700::1111", // Cloudflare DNS
    "2001:4860:4860::8888", // Google DNS
  ])("accepts public %s", (addr) => {
    expect(isPublicAddress(addr)).toBe(true);
  });

  it.each([
    "::1", // loopback
    "::", // unspecified
    "fe80::1", // link-local
    "fc00::1", // ULA
    "fd00::1", // ULA
    "ff00::1", // multicast
    "2001:db8::1", // documentation
    "64:ff9b::1.2.3.4", // NAT64 well-known
  ])("refuses non-public %s", (addr) => {
    expect(isPublicAddress(addr)).toBe(false);
  });

  it("refuses IPv4-mapped IPv6 of a private v4 (dotted form)", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
  });

  it("refuses IPv4-mapped IPv6 of a private v4 (hex form)", () => {
    // ::ffff:7f00:1 == ::ffff:127.0.0.1 — same address, hex spelling.
    expect(isPublicAddress("::ffff:7f00:1")).toBe(false);
    // ::ffff:0a00:1 == ::ffff:10.0.0.1
    expect(isPublicAddress("::ffff:0a00:1")).toBe(false);
  });

  it("accepts IPv4-mapped IPv6 of a public v4", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });
});

describe("isPublicAddress — non-IP input", () => {
  it.each(["", "not-an-ip", "127", "256.0.0.1", "1.2.3"])(
    "refuses %s",
    (input) => {
      expect(isPublicAddress(input)).toBe(false);
    },
  );
});

describe("fetchRemoteMedia — synchronous URL validation", () => {
  // Any test below should reject before any network activity, so they
  // run instantly even with a tiny timeout. If a network call leaks
  // through, the timeout makes the test fail loudly rather than hanging.
  const opts = { maxBytes: 1024, timeoutMs: 2000 };

  async function expectError(
    url: string,
    expectedCode: RemoteFetchError["code"],
  ) {
    let thrown: unknown;
    try {
      await fetchRemoteMedia(url, opts);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(RemoteFetchError);
    expect((thrown as RemoteFetchError).code).toBe(expectedCode);
  }

  it("rejects file:// URLs", async () => {
    await expectError("file:///etc/passwd", "DISALLOWED_PROTOCOL");
  });

  it("rejects gopher:// URLs", async () => {
    await expectError("gopher://example.com/", "DISALLOWED_PROTOCOL");
  });

  it("rejects ftp:// URLs", async () => {
    await expectError("ftp://example.com/file", "DISALLOWED_PROTOCOL");
  });

  it("rejects URLs with embedded credentials", async () => {
    await expectError("https://user:pass@example.com/", "INVALID_URL");
    await expectError("https://user@example.com/", "INVALID_URL");
  });

  it("rejects malformed URLs", async () => {
    await expectError("not a url", "INVALID_URL");
    // Note: `https:///path` is technically valid per the URL spec —
    // Node parses it as host="path", path="/" — so it doesn't belong
    // here. We rely on DNS / IP-validation to reject those further down.
  });

  it("rejects loopback IPv4 literal pre-flight", async () => {
    await expectError("https://127.0.0.1:1234/x", "PRIVATE_ADDRESS");
  });

  it("rejects AWS metadata IPv4 literal pre-flight", async () => {
    await expectError(
      "https://169.254.169.254/latest/meta-data/",
      "PRIVATE_ADDRESS",
    );
  });

  it("rejects loopback IPv6 literal pre-flight", async () => {
    await expectError("https://[::1]:1234/x", "PRIVATE_ADDRESS");
  });

  it("rejects v4-mapped loopback IPv6 literal (dotted) pre-flight", async () => {
    await expectError(
      "https://[::ffff:127.0.0.1]:1234/x",
      "PRIVATE_ADDRESS",
    );
  });

  it("rejects v4-mapped loopback IPv6 literal (hex) pre-flight", async () => {
    // Browser canonicalizes [::ffff:127.0.0.1] to [::ffff:7f00:1] inside URL —
    // both forms must be rejected.
    await expectError("https://[::ffff:7f00:1]:1234/x", "PRIVATE_ADDRESS");
  });

  it("rejects RFC 1918 IPv4 literal pre-flight", async () => {
    await expectError("https://10.0.0.1/x", "PRIVATE_ADDRESS");
    await expectError("https://192.168.1.1/x", "PRIVATE_ADDRESS");
  });
});
