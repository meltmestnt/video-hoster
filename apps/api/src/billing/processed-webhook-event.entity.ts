import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

// Idempotency log for external webhook providers (currently LemonSqueezy).
// We store one row per (provider, eventId) the first time we successfully
// process it; subsequent deliveries hit the unique key and short-circuit
// before any DB mutation runs. Replays of legitimately-signed events —
// e.g. a captured "active" payload re-posted after the user cancels —
// can no longer flip the user back into a paid tier for free.
@Entity("processed_webhook_events")
@Index(["provider", "eventId"], { unique: true })
export class ProcessedWebhookEvent {
  @PrimaryColumn({ type: "varchar", length: 32 })
  provider: string;

  @PrimaryColumn({ type: "varchar", length: 128 })
  eventId: string;

  @Column({ type: "varchar", length: 64 })
  eventName: string;

  @CreateDateColumn()
  processedAt: Date;
}
