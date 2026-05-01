import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { S3Service } from "../s3/s3.service";
import { MediaService, isMediaKind } from "./media.service";
import {
  acquireStreamSlot,
  concurrentStreamsForIp,
  enforceMediaThrottle,
  MediaThrottleException,
} from "./media-throttle";

// Scrapers and link-unfurling bots from the platforms we want to keep
// shareable on. Match these UA patterns and we skip the hotlink Referer
// check — they often send their own host as Referer (e.g. Slack pulling
// an oEmbed photo URL) which would otherwise look like third-party
// hotlinking. UA can be spoofed but that's fine; the cost-saving target
// is human-driven hotlinks, not bot-grade evasion.
const KNOWN_SCRAPER_UA = [
  /Discordbot/i,
  /Twitterbot/i,
  /Slackbot/i,
  /TelegramBot/i,
  /facebookexternalhit/i,
  /WhatsApp/i,
  /LinkedInBot/i,
  /SkypeUriPreview/i,
  /redditbot/i,
  /Mastodon/i,
  /Pleroma/i,
  /Akkoma/i,
  /SignalBot/i,
  /vkShare/i,
  /Bluesky/i,
];

// Platform-side Referer hosts to allow when a sharer's user-agent isn't
// the bot itself but the request is coming from the platform's media
// proxy (Discord's CDN, Twitter's video proxy, etc.). These are domains
// that legitimately re-fetch our media URLs to display them inline.
const KNOWN_PLATFORM_REFERER_HOSTS = new Set([
  "discord.com",
  "discordapp.com",
  "discordapp.net",
  "twitter.com",
  "x.com",
  "t.co",
  "twimg.com",
  "telegram.org",
  "t.me",
  "slack.com",
  "slack-edge.com",
  "facebook.com",
  "fbcdn.net",
  "linkedin.com",
  "reddit.com",
  "redditmedia.com",
  "redditstatic.com",
  "whatsapp.net",
]);

/**
 * Streams S3 objects through the API so the client never sees the bucket.
 * Auth is by signed query params (`exp` + `sig`) — same security model as
 * presigned S3 URLs, just with our origin instead of AWS.
 */
@Controller("media")
export class MediaController {
  private readonly logger = new Logger(MediaController.name);
  private readonly allowedRefererHosts: ReadonlySet<string>;

  constructor(
    private readonly media: MediaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {
    // Hosts allowed to embed our /media/ stream. WEB_ORIGIN is the
    // primary; ALLOWED_MEDIA_REFERERS lets ops add extra hosts (e.g.
    // a marketing landing page) without redeploying. Empty Referer
    // is always allowed — direct navigation, privacy modes, and most
    // mobile apps strip Referer entirely.
    const hosts = new Set<string>();
    const webOrigin = config.get<string>("WEB_ORIGIN");
    if (webOrigin) {
      try {
        hosts.add(new URL(webOrigin).host);
      } catch {
        // Misconfigured WEB_ORIGIN — fail open so the wallet-protection
        // doesn't accidentally lock real users out.
        this.logger.warn(
          `WEB_ORIGIN="${webOrigin}" is not a valid URL; hotlink check disabled.`,
        );
      }
    }
    const extra = config.get<string>("ALLOWED_MEDIA_REFERERS") ?? "";
    for (const raw of extra.split(",")) {
      const v = raw.trim();
      if (!v) continue;
      try {
        hosts.add(new URL(v).host);
      } catch {
        // Try as bare host
        hosts.add(v);
      }
    }
    this.allowedRefererHosts = hosts;
  }

  private isAllowedReferer(referer: string | undefined): boolean {
    if (!referer) return true;
    if (this.allowedRefererHosts.size === 0) return true;
    try {
      const host = new URL(referer).host;
      if (this.allowedRefererHosts.has(host)) return true;
      // Allow root + subdomains of known social platforms so e.g. a
      // Slack image-proxy on `slack-edge.com` or Discord's
      // `images-ext-1.discordapp.net` flows through. Without this,
      // pasting a vidsandgifs link in any social app silently breaks
      // the inline preview.
      for (const platform of KNOWN_PLATFORM_REFERER_HOSTS) {
        if (host === platform || host.endsWith(`.${platform}`)) {
          return true;
        }
      }
      return false;
    } catch {
      // Malformed Referer — treat as suspicious. Real browsers always
      // send a parseable URL when they send one at all.
      return false;
    }
  }

  private isKnownScraperUa(ua: string | undefined): boolean {
    if (!ua) return false;
    return KNOWN_SCRAPER_UA.some((re) => re.test(ua));
  }

  @Get(":kind/:id")
  async stream(
    @Param("kind") kindParam: string,
    @Param("id") id: string,
    @Query("exp") expRaw: string | undefined,
    @Query("sig") sig: string | undefined,
    @Headers("range") rangeHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!isMediaKind(kindParam)) {
      throw new BadRequestException("Unknown media kind");
    }
    if (!expRaw || !sig) {
      throw new BadRequestException("Missing signature");
    }
    const exp = Number(expRaw);
    this.media.verify({ kind: kindParam, id, exp, sig });

    // Resolve client IP through the same proxy chain trpc.service uses —
    // CF-Connecting-IP wins (Cloudflare-set, spoofing-resistant), else
    // Express's X-Forwarded-For-derived req.ip. Used as the throttle key
    // and shows up in every traffic log line.
    const cfIp = req.headers["cf-connecting-ip"];
    const ip =
      (Array.isArray(cfIp) ? cfIp[0] : cfIp) || req.ip || "unknown";
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 200);
    const referer = String(req.headers["referer"] ?? "").slice(0, 200);

    // Hotlink protection — anyone embedding our streams on a third-party
    // page burns our bandwidth without ever loading our site. Avatars,
    // thumbnails, and screenshots are static images we want shareable, so
    // they bypass the check; only video/gif/audio (the cost-heavy kinds)
    // are gated. Known social-platform scrapers and proxies bypass too,
    // so links keep unfurling on Discord/Slack/Twitter/Telegram/etc.
    const isCostHeavy =
      kindParam === "video" || kindParam === "gif" || kindParam === "audio";
    if (
      isCostHeavy &&
      !this.isKnownScraperUa(ua) &&
      !this.isAllowedReferer(referer || undefined)
    ) {
      this.logger.warn(
        `media.stream blocked=hotlink ip=${ip} kind=${kindParam} id=${id} referer="${referer}" ua="${ua}"`,
      );
      throw new ForbiddenException("Hotlinking is not allowed");
    }

    const key = await this.media.resolveKeyOrThrow(kindParam, id);
    const obj = await this.s3.getObjectStream(key, rangeHeader);

    // Bytes the response advertises — we cap on this rather than actual
    // streamed bytes because S3 has already started shipping by the time
    // the client could abort. Conservative on purpose.
    const advertisedBytes = obj.contentLength ?? 0;
    let throttleState: ReturnType<typeof enforceMediaThrottle>;
    // Concurrent-stream cap is video-only: a long video held open is the
    // real cost-per-connection multiplier. GIFs and audio finish quickly,
    // and listing pages render many GIF tiles in parallel — applying the
    // cap there would 429 the legitimate grid view.
    let slot: ReturnType<typeof acquireStreamSlot> | null = null;
    try {
      throttleState = enforceMediaThrottle(ip, advertisedBytes);
      if (kindParam === "video") {
        slot = acquireStreamSlot(ip);
      }
    } catch (err) {
      // Make sure we close the upstream S3 stream — otherwise we'd hold
      // the socket open while sending a 429 to the client.
      obj.body.destroy();
      const reason =
        err instanceof MediaThrottleException ? err.reason : "throttle-error";
      this.logger.warn(
        `media.stream blocked=${reason} ip=${ip} kind=${kindParam} id=${id} bytes=${advertisedBytes} ua="${ua}" referer="${referer}"`,
      );
      throw err;
    }
    this.logger.log(
      `media.stream ip=${ip} kind=${kindParam} id=${id} bytes=${advertisedBytes} reqs=${throttleState.reqsInWindow}/${throttleState.reqLimit} bytes24h=${throttleState.bytesInWindow}/${throttleState.bytesLimit} concurrent=${concurrentStreamsForIp(ip)} range="${rangeHeader ?? ""}" ua="${ua}" referer="${referer}"`,
    );

    // Mirror what S3 sent back so video seeking, conditional GETs, and
    // browser caches behave the way they did before the proxy.
    if (obj.contentType) res.setHeader("Content-Type", obj.contentType);
    if (obj.contentLength != null) {
      res.setHeader("Content-Length", String(obj.contentLength));
    }
    if (obj.contentRange) res.setHeader("Content-Range", obj.contentRange);
    // Always advertise byte-range support — without this, browsers won't
    // even ask for ranges and seeking in <video> breaks.
    res.setHeader("Accept-Ranges", obj.acceptRanges ?? "bytes");
    if (obj.etag) res.setHeader("ETag", obj.etag);
    if (obj.lastModified) {
      res.setHeader("Last-Modified", obj.lastModified.toUTCString());
    }
    // Match the signed-URL TTL so the browser doesn't hold a "fresh" cached
    // response past the point the URL itself stops working. The URL is
    // unique per page load (querystring-signed), so revisits fetch a new
    // cache entry anyway.
    res.setHeader(
      "Cache-Control",
      obj.cacheControl ?? "private, max-age=900",
    );
    res.status(obj.statusCode);

    // Release the concurrent-stream slot once the response is no longer
    // active. Hooking both "close" (client disconnected mid-stream, or
    // response completed normally) and the body's "end"/"error" handlers
    // covers every termination path. release() is idempotent and a no-op
    // when no slot was acquired (gif/audio/etc).
    const releaseSlot = () => {
      if (slot) slot.release();
    };
    req.on("close", () => {
      obj.body.destroy();
      releaseSlot();
    });
    res.on("close", releaseSlot);
    res.on("finish", releaseSlot);
    obj.body.on("error", (err) => {
      this.logger.warn(
        `Media stream error for ${kindParam}/${id}: ${(err as Error).message}`,
      );
      if (!res.headersSent) res.status(500);
      res.end();
      releaseSlot();
    });
    obj.body.pipe(res);
  }
}
