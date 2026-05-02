import { Logger } from "@nestjs/common";
import { lookup as dnsLookupCb } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

const log = new Logger("UrlFetcher");

export interface FetchedRemoteMedia {
  buffer: Buffer;
  contentType: string | null;
  contentLength: number;
  finalUrl: string;
}

// Discriminated error so callers can map cleanly to user-facing
// messages. All RemoteFetchError instances are safe to surface as 4xx
// — none imply server bugs; they're either input validation or
// upstream behavior we want to refuse.
export class RemoteFetchError extends Error {
  readonly code:
    | "INVALID_URL"
    | "DISALLOWED_PROTOCOL"
    | "PRIVATE_ADDRESS"
    | "DNS_FAILURE"
    | "TOO_MANY_REDIRECTS"
    | "REDIRECT_LOCATION_INVALID"
    | "TOO_LARGE"
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP_STATUS";

  constructor(message: string, code: RemoteFetchError["code"]) {
    super(message);
    this.name = "RemoteFetchError";
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 3;

// In production we refuse plain HTTP entirely — no media source we'd
// want to ingest is HTTP-only in 2026, and HTTP redirects through us
// are a classic SSRF smuggling vector. NODE_ENV=development relaxes
// to also allow http: so the dev server (localhost-blocked anyway by
// the IP guard) doesn't choke when testing against demo CDNs that
// fall back to http.
function allowedProtocols(): readonly string[] {
  return process.env.NODE_ENV === "production"
    ? (["https:"] as const)
    : (["https:", "http:"] as const);
}

// Single shared dispatcher: undici's Agent takes a `connect.lookup`
// hook that runs *every time* it opens a socket — so it fires on the
// initial connect AND on each redirect (as long as we use this same
// dispatcher). Returning an error from the hook makes undici reject
// the request before any TCP packets fly. The hook signature matches
// node:net's LookupFunction: (err, address, family). Note: undici
// only invokes lookup for hostname-bearing URLs; IP-literal hostnames
// (`http://127.0.0.1/`) skip the hook entirely, so those have to be
// validated separately in {@link fetchSingleHop} before the request
// is even started.
const safeDispatcher = new Agent({
  connect: {
    // undici 8.x requests `all: true` from the lookup function and
    // expects an array-form callback in return — even though the
    // public LookupFunction TS contract is single-form. Match what
    // the call site actually wants by detecting `options.all`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lookup: ((hostname: string, options: any, callback: any) => {
      const wantsAll = !!options?.all;
      // Always pass `all: true` to dns.lookup so we see every
      // candidate and can pick a publicly-routable one. A hostname
      // whose primary record is internal but secondary is public
      // shouldn't be refused.
      dnsLookupCb(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) {
          if (wantsAll) callback(err);
          else callback(err, "", 0);
          return;
        }
        const list = Array.isArray(addresses) ? addresses : [];
        const safe = list.filter((entry) => isPublicAddress(entry.address));
        if (safe.length === 0) {
          const refusal = privateAddressError(
            hostname,
            list.map((e) => e.address).join(",") || "(none)",
          );
          if (wantsAll) callback(refusal);
          else callback(refusal, "", 0);
          return;
        }
        if (wantsAll) {
          callback(null, safe);
        } else {
          callback(null, safe[0].address, safe[0].family);
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  },
  // Cap connection setup so a slow TLS handshake can't hold the
  // request open past our deadline.
  connectTimeout: 10_000,
  // Idle / per-step timeouts. The wall-clock AbortController is the
  // upper bound; these keep things responsive in the common case.
  headersTimeout: 15_000,
  bodyTimeout: 30_000,
});

function privateAddressError(hostname: string, address: string): NodeJS.ErrnoException {
  const err = new Error(
    `Refused: ${hostname} resolves to non-public address ${address}`,
  ) as NodeJS.ErrnoException;
  // EAI_AGAIN-style code so undici treats it as a DNS failure rather
  // than a bug. Surfaces back through fetch() as a TypeError we
  // re-classify in fetchSingleHop.
  err.code = "ENOTFOUND";
  err.errno = -3008;
  (err as Error & { __ssrf: true }).__ssrf = true;
  return err;
}

/**
 * SSRF-safe HTTP/HTTPS GET. Resolves DNS via undici's connect.lookup
 * hook so every socket — initial request and each redirect — passes
 * the same address allow-list before any bytes leave the box. Refuses
 * loopback, private RFC 1918 ranges, link-local (incl. 169.254.169.254
 * cloud metadata), multicast, broadcast, IPv4-mapped IPv6 of the same.
 *
 * Manual redirect handling lets us re-validate each Location URL: the
 * URL parser rejects non-http(s) targets (e.g. file://, gopher://,
 * dict://) before undici ever sees the next hop.
 *
 * Streams the response with a hard byte cap and a hard wall-clock
 * deadline — the byte cap kills the connection mid-stream rather than
 * buffering everything before checking.
 */
export async function fetchRemoteMedia(
  inputUrl: string,
  opts: { maxBytes: number; timeoutMs?: number },
): Promise<FetchedRemoteMedia> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  let currentUrl = inputUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remainingMs = Math.max(1000, deadline - Date.now());
    const result = await fetchSingleHop(currentUrl, {
      maxBytes: opts.maxBytes,
      remainingMs,
    });
    if (result.kind === "redirect") {
      if (hop === MAX_REDIRECTS) {
        throw new RemoteFetchError(
          `Too many redirects (>${MAX_REDIRECTS})`,
          "TOO_MANY_REDIRECTS",
        );
      }
      const next = resolveRedirect(currentUrl, result.location);
      if (!next) {
        throw new RemoteFetchError(
          "Redirect to a non-http(s) URL",
          "REDIRECT_LOCATION_INVALID",
        );
      }
      log.log(
        `redirect ${currentUrl} -> ${next} (hop ${hop + 1}/${MAX_REDIRECTS})`,
      );
      currentUrl = next;
      continue;
    }
    return result.payload;
  }
  // Loop guard — early-return covers all paths above; this just keeps
  // the type checker happy.
  throw new RemoteFetchError("Unreachable", "NETWORK");
}

function resolveRedirect(base: string, loc: string): string | null {
  try {
    const u = new URL(loc, base);
    if (!allowedProtocols().includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

interface SingleHopRedirect {
  kind: "redirect";
  location: string;
}
interface SingleHopPayload {
  kind: "payload";
  payload: FetchedRemoteMedia;
}
type SingleHopResult = SingleHopRedirect | SingleHopPayload;

async function fetchSingleHop(
  url: string,
  opts: { maxBytes: number; remainingMs: number },
): Promise<SingleHopResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteFetchError("Invalid URL", "INVALID_URL");
  }
  if (!allowedProtocols().includes(parsed.protocol)) {
    throw new RemoteFetchError(
      `Disallowed protocol: ${parsed.protocol}`,
      "DISALLOWED_PROTOCOL",
    );
  }
  // Userinfo in URLs is rare for direct media downloads and a common
  // SSRF smuggling vector ("https://attacker@internal/..."). Refuse
  // outright.
  if (parsed.username || parsed.password) {
    throw new RemoteFetchError(
      "Credentials in URL are not allowed",
      "INVALID_URL",
    );
  }
  if (!parsed.hostname) {
    throw new RemoteFetchError("URL has no hostname", "INVALID_URL");
  }

  // undici only calls connect.lookup for hostname URLs — when the
  // host is an IP literal it connects directly. So validate IP
  // literals up front; otherwise something like `https://127.0.0.1/`
  // or `https://[::ffff:127.0.0.1]/` would slip past the lookup hook
  // and reach the socket. URL.hostname keeps brackets on IPv6, strip
  // them before the family check.
  const bareHost = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bareHost) !== 0 && !isPublicAddress(bareHost)) {
    throw new RemoteFetchError(
      `Address ${bareHost} is private or reserved`,
      "PRIVATE_ADDRESS",
    );
  }

  const ac = new AbortController();
  const killer = setTimeout(() => ac.abort(), opts.remainingMs);

  let response;
  try {
    response = await undiciFetch(url, {
      method: "GET",
      // Manual handling — we want to re-validate each redirect URL
      // ourselves so a 30x to file:// or to a different protocol gets
      // refused at the URL-parse stage, not at the IP-validation stage.
      redirect: "manual",
      headers: {
        "User-Agent":
          "vidsandgifs-url-fetcher/1.0 (+https://vidsandgifs.xyz)",
        // Refuse content-coding entirely. Media files are already
        // compressed; gzip/br on top adds nothing legitimate but opens
        // the door to gzip-bomb amplification past our byte cap.
        "Accept-Encoding": "identity",
      },
      signal: ac.signal,
      dispatcher: safeDispatcher,
    });
  } catch (err) {
    clearTimeout(killer);
    if (ac.signal.aborted) {
      throw new RemoteFetchError("Fetch timed out", "TIMEOUT");
    }
    // Map our SSRF-guard sentinel back to a clean PRIVATE_ADDRESS error
    // — undici wraps the cause in a TypeError, but the original is on
    // .cause and carries our __ssrf marker.
    const cause = (err as { cause?: Error & { __ssrf?: boolean } }).cause;
    if (cause?.__ssrf) {
      throw new RemoteFetchError(cause.message, "PRIVATE_ADDRESS");
    }
    throw new RemoteFetchError(
      `Network error: ${(err as Error).message}`,
      "NETWORK",
    );
  }

  const status = response.status;

  // 3xx — bubble Location up to the outer loop. undici's "manual"
  // redirect mode leaves the body around; consume it so the socket
  // returns to the pool.
  if (status >= 300 && status < 400) {
    const location = response.headers.get("location");
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    clearTimeout(killer);
    if (typeof location === "string" && location.length > 0) {
      return { kind: "redirect", location };
    }
    throw new RemoteFetchError(
      `Redirect status ${status} without Location header`,
      "REDIRECT_LOCATION_INVALID",
    );
  }

  if (status < 200 || status >= 300) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    clearTimeout(killer);
    throw new RemoteFetchError(
      `Source returned HTTP ${status}`,
      "HTTP_STATUS",
    );
  }

  // Pre-fail on declared length so we don't burn bandwidth on a
  // payload the server already told us is too big.
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > opts.maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    clearTimeout(killer);
    throw new RemoteFetchError(
      `Content-Length ${declared} exceeds cap ${opts.maxBytes}`,
      "TOO_LARGE",
    );
  }

  if (!response.body) {
    clearTimeout(killer);
    throw new RemoteFetchError("Empty response body", "NETWORK");
  }

  // Stream and cap. Aborting on overflow drops the connection so we
  // don't keep pulling bytes after we've already decided to refuse.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > opts.maxBytes) {
        ac.abort();
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        throw new RemoteFetchError(
          `Body exceeded byte cap (${opts.maxBytes})`,
          "TOO_LARGE",
        );
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof RemoteFetchError) throw err;
    if (ac.signal.aborted) {
      throw new RemoteFetchError("Fetch timed out", "TIMEOUT");
    }
    throw new RemoteFetchError(
      `Stream error: ${(err as Error).message}`,
      "NETWORK",
    );
  } finally {
    clearTimeout(killer);
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const contentType =
    (response.headers.get("content-type") ?? "").split(";")[0].trim() || null;
  return {
    kind: "payload",
    payload: {
      buffer,
      contentType,
      contentLength: buffer.length,
      finalUrl: url,
    },
  };
}

// node:net BlockList handles canonical IPv6 form (compressed,
// expanded, mixed) so we don't have to write our own normalizer. The
// IPv4-mapped prefix is detected separately and routed through the
// IPv4 list — that way `::ffff:127.0.0.1` and `::ffff:7f00:1` (the
// hex spelling of the same address) both fall through to the v4
// loopback check instead of slipping past the v6 prefix rules.
const blockedV4 = new BlockList();
blockedV4.addRange("0.0.0.0", "0.255.255.255"); // "this network"
blockedV4.addRange("10.0.0.0", "10.255.255.255"); // RFC 1918
blockedV4.addRange("100.64.0.0", "100.127.255.255"); // CGN
blockedV4.addRange("127.0.0.0", "127.255.255.255"); // loopback
blockedV4.addAddress("168.63.129.16"); // Azure WireServer
blockedV4.addRange("169.254.0.0", "169.254.255.255"); // link-local incl. metadata
blockedV4.addRange("172.16.0.0", "172.31.255.255"); // RFC 1918
blockedV4.addRange("192.0.0.0", "192.0.0.255"); // IETF assignments
blockedV4.addRange("192.0.2.0", "192.0.2.255"); // TEST-NET-1
blockedV4.addRange("192.168.0.0", "192.168.255.255"); // RFC 1918
blockedV4.addRange("198.18.0.0", "198.19.255.255"); // benchmark
blockedV4.addRange("198.51.100.0", "198.51.100.255"); // TEST-NET-2
blockedV4.addRange("203.0.113.0", "203.0.113.255"); // TEST-NET-3
blockedV4.addRange("224.0.0.0", "239.255.255.255"); // multicast
blockedV4.addRange("240.0.0.0", "255.255.255.255"); // reserved + broadcast

const blockedV6 = new BlockList();
blockedV6.addAddress("::", "ipv6"); // unspecified
blockedV6.addAddress("::1", "ipv6"); // loopback
blockedV6.addRange("64:ff9b::", "64:ff9b:1:ffff:ffff:ffff:ffff:ffff", "ipv6"); // NAT64
blockedV6.addRange("fc00::", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6"); // ULA
blockedV6.addRange("fe80::", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6"); // link-local
blockedV6.addRange("ff00::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6"); // multicast
blockedV6.addRange("2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "ipv6"); // docs

/**
 * Returns true only for addresses safe to connect to from the server.
 * Anything internal (loopback, private, link-local incl. cloud
 * metadata, multicast, reserved, IPv4-mapped IPv6 of the same) is
 * refused. Exported so other server-side features that take
 * user-supplied addresses can reuse the same allow-list.
 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return !blockedV4.check(address, "ipv4");
  }
  if (family === 6) {
    // v4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:abcd:ef01) — extract
    // the embedded v4 and run it through the v4 list, otherwise
    // ::ffff:127.0.0.1 etc. would slip past the v6 prefix rules.
    const mapped = extractMappedIPv4(address);
    if (mapped) {
      return !blockedV4.check(mapped, "ipv4");
    }
    return !blockedV6.check(address, "ipv6");
  }
  return false;
}

function extractMappedIPv4(addr: string): string | null {
  const lower = addr.toLowerCase();
  // Canonical dotted form: ::ffff:1.2.3.4 (with optional zero-prefix
  // hextets that some libraries emit for compatibility).
  const dotted = lower.match(
    /^(?:0{0,4}:){0,5}ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/,
  );
  if (dotted) return dotted[1];
  // Hex form: ::ffff:abcd:ef01 — bytes 0xab, 0xcd, 0xef, 0x01.
  const hex = lower.match(
    /^(?:0{0,4}:){0,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${(a >> 8) & 0xff}.${a & 0xff}.${(b >> 8) & 0xff}.${b & 0xff}`;
  }
  return null;
}
