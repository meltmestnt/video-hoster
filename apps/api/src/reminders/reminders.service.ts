import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { UsersService } from "../users/users.service";

/**
 * Scheduled-task host. Lives in the same Nest process as the API — no
 * separate Railway cron service needed; @nestjs/schedule registers an
 * in-process timer once the app boots.
 *
 * If the API is restarted (deploy, crash) right around firing time the
 * job is skipped for that day — that's acceptable here since reminders
 * are idempotent (the per-user 23h floor inside sendConfirmationReminders
 * means the next day's run picks up exactly where this one left off).
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(private readonly users: UsersService) {}

  // Daily at 12:00 UTC. Picked midday so European morning users open their
  // inbox after the email lands; far enough from midnight that DST flips
  // never duplicate a run.
  @Cron(CronExpression.EVERY_DAY_AT_NOON, {
    name: "send-confirmation-reminders",
    timeZone: "UTC",
  })
  async dailyConfirmationReminders(): Promise<void> {
    this.logger.log("Starting daily confirmation-reminder sweep");
    try {
      const result = await this.users.sendConfirmationReminders();
      this.logger.log(
        `Reminder sweep done: considered=${result.considered} sent=${result.sent} failed=${result.failed} (cap=${result.capped})`,
      );
    } catch (err) {
      // Never let a cron failure crash the process — Nest's default
      // behavior on an unhandled rejection in a @Cron handler is to log
      // and continue, but we belt-and-suspenders it here so the next
      // run still fires on schedule.
      this.logger.error(
        `Reminder sweep crashed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
