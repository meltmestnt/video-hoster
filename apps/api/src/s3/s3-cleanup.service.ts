import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { S3Service } from "./s3.service";

// Anything older than 24 h that's still in the multipart-pending state
// is almost certainly abandoned (presigned PUT TTL is 15 min, the
// UploadId only matters until the client calls Complete or Abort).
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Daily housekeeping for orphaned S3 multipart uploads.
 *
 * The @aws-sdk/lib-storage Upload class (used by S3Service.uploadFile)
 * automatically uses multipart for files > 5 MB. If `upload.done()`
 * throws — network blip, process restart mid-transcode, etc. — the
 * upload may not get aborted, and the parts sit in S3 indefinitely.
 * They don't appear in ListObjects, but they bill for storage and
 * accumulate forever.
 *
 * Runs in-process via @nestjs/schedule (no separate Railway cron
 * service needed — same pattern as RemindersService). If the API is
 * restarted right around firing time the run is skipped for that day,
 * which is fine: the next day's run picks up everything that's still
 * stale.
 */
@Injectable()
export class S3CleanupService {
  private readonly logger = new Logger(S3CleanupService.name);

  constructor(private readonly s3: S3Service) {}

  // Daily at 03:00 UTC. Off-peak globally and far from the
  // confirmation-reminder sweep at 12:00 UTC, so the two cron handlers
  // never fight for the same DB/network window.
  @Cron("0 3 * * *", {
    name: "abort-stale-multipart-uploads",
    timeZone: "UTC",
  })
  async daily(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      // Never let a cron failure crash the process — Nest will keep
      // the schedule running, but we log explicitly so a missed run
      // is greppable.
      this.logger.error(
        `s3-cleanup crashed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Public entry point so the admin tRPC endpoint can trigger this
   * on demand instead of waiting until 03:00 UTC for the cron.
   * Returns counters so the caller can render them in the UI / logs.
   */
  async runOnce(): Promise<{
    found: number;
    aborted: number;
    failed: number;
    skippedFresh: number;
  }> {
    const startedAt = Date.now();
    const cutoff = startedAt - STALE_AFTER_MS;
    this.logger.log(
      `s3-cleanup starting; staleness cutoff = ${new Date(cutoff).toISOString()}`,
    );

    let found = 0;
    let aborted = 0;
    let failed = 0;
    let skippedFresh = 0;

    for await (const u of this.s3.listAllMultipartUploads()) {
      found++;
      if (u.initiated.getTime() >= cutoff) {
        skippedFresh++;
        continue;
      }
      try {
        await this.s3.abortMultipartUpload(u.key, u.uploadId);
        aborted++;
        this.logger.log(
          `s3-cleanup aborted key=${u.key} uploadId=${u.uploadId.slice(0, 12)}… initiated=${u.initiated.toISOString()}`,
        );
      } catch (err) {
        failed++;
        this.logger.warn(
          `s3-cleanup abort failed key=${u.key}: ${(err as Error).message}`,
        );
      }
    }

    const ms = Date.now() - startedAt;
    this.logger.log(
      `s3-cleanup done in ${ms}ms: found=${found} aborted=${aborted} skippedFresh=${skippedFresh} failed=${failed}`,
    );
    return { found, aborted, failed, skippedFresh };
  }
}
