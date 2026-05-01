import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Logger,
  Param,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { S3Service } from "../s3/s3.service";
import { MediaService, isMediaKind } from "./media.service";
import {
  enforceMediaThrottle,
  MediaThrottleException,
} from "./media-throttle";

/**
 * Streams S3 objects through the API so the client never sees the bucket.
 * Auth is by signed query params (`exp` + `sig`) — same security model as
 * presigned S3 URLs, just with our origin instead of AWS.
 */
@Controller("media")
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly media: MediaService,
    private readonly s3: S3Service,
  ) {}

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

    const key = await this.media.resolveKeyOrThrow(kindParam, id);
    const obj = await this.s3.getObjectStream(key, rangeHeader);

    // Bytes the response advertises — we cap on this rather than actual
    // streamed bytes because S3 has already started shipping by the time
    // the client could abort. Conservative on purpose.
    const advertisedBytes = obj.contentLength ?? 0;
    let throttleState: ReturnType<typeof enforceMediaThrottle>;
    try {
      throttleState = enforceMediaThrottle(ip, advertisedBytes);
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
      `media.stream ip=${ip} kind=${kindParam} id=${id} bytes=${advertisedBytes} reqs=${throttleState.reqsInWindow}/${throttleState.reqLimit} bytes24h=${throttleState.bytesInWindow}/${throttleState.bytesLimit} range="${rangeHeader ?? ""}" ua="${ua}" referer="${referer}"`,
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
    // Long client-side cache; the URL itself expires in an hour, so the
    // browser can't keep it usable past that anyway.
    res.setHeader(
      "Cache-Control",
      obj.cacheControl ?? "private, max-age=3600",
    );
    res.status(obj.statusCode);

    // Bail out early if the client disconnected mid-stream so we don't
    // keep pulling bytes from S3 for nothing.
    req.on("close", () => obj.body.destroy());
    obj.body.on("error", (err) => {
      this.logger.warn(
        `Media stream error for ${kindParam}/${id}: ${(err as Error).message}`,
      );
      if (!res.headersSent) res.status(500);
      res.end();
    });
    obj.body.pipe(res);
  }
}
