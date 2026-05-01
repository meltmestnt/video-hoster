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

    const key = await this.media.resolveKeyOrThrow(kindParam, id);
    const obj = await this.s3.getObjectStream(key, rangeHeader);

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
