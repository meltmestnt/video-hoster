import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { BillingService } from "./billing.service";

@Controller("webhook")
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billing: BillingService) {}

  /**
   * LemonSqueezy webhook. Mounted with raw-body parsing in main.ts so the
   * HMAC-SHA256 signature check sees the unmodified bytes. Returning
   * non-2xx makes LS retry, so we always 200 unless the signature itself
   * is invalid.
   */
  @Post("lemonsqueezy")
  @HttpCode(200)
  async lemonsqueezy(
    @Req() req: Request,
    @Headers("x-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException(
        "Missing raw body — webhook route is not configured for raw parsing",
      );
    }
    if (!this.billing.verifySignature(raw, signature)) {
      this.logger.warn(`LemonSqueezy webhook signature verification failed`);
      throw new BadRequestException("Invalid signature");
    }

    let payload;
    try {
      payload = this.billing.parsePayload(raw);
    } catch (err) {
      this.logger.warn(
        `Failed to parse LemonSqueezy payload: ${(err as Error).message}`,
      );
      throw new BadRequestException("Invalid payload");
    }

    try {
      await this.billing.handleEvent(payload);
    } catch (err) {
      // Log + still 200 so LS doesn't retry forever on a bug we have
      // visibility into.
      this.logger.error(
        `Failed to handle LemonSqueezy event ${payload.meta?.event_name}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
    return { received: true };
  }
}
