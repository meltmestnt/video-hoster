import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type UserStatus = "verified" | "unverified";
export type UserRole = "admin" | "user";
export type SubscriptionTier = "free" | "pro";
// LemonSqueezy ships richer states (paused, unpaid, expired, etc.) which all
// collapse to "inactive" at sync time — we only care whether access is granted.
export type SubscriptionStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true })
  googleId: string | null;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  avatarUrl: string | null;

  @Column({ type: "text", nullable: true })
  avatarS3Key: string | null;

  @Column({ type: "text", nullable: true, select: false })
  passwordHash: string | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "unverified" })
  status: UserStatus;

  @Index()
  @Column({ type: "varchar", length: 16, default: "user" })
  role: UserRole;

  // Admin-controlled moderation flag. New accounts default to false;
  // an admin promotes them to true via the manage page. Independent from
  // `status` (email verification) — a user can be verified-but-not-approved
  // and still faces a stricter daily quota until an admin approves them.
  @Index()
  @Column({ type: "boolean", default: false })
  approved: boolean;

  @Index()
  @Column({ type: "varchar", length: 64, nullable: true })
  confirmationTokenHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  confirmationTokenExpiresAt: Date | null;

  // How many reminder emails the daily cron has already sent to this
  // user. Capped at 3 (see RemindersService) so we don't keep nagging
  // someone who's clearly chosen to abandon the account.
  @Column({ type: "int", default: 0 })
  confirmationRemindersSent: number;

  // When the last reminder went out. Used to enforce a one-per-day floor
  // even if the cron is re-triggered, and to hold off on the very first
  // reminder until the user has had ~24h to confirm naturally.
  @Column({ type: "timestamptz", nullable: true })
  lastConfirmationReminderAt: Date | null;

  @Column({ type: "boolean", default: true })
  miniPlayerEnabled: boolean;

  @Column({ type: "boolean", default: false })
  miniPlayerPromptSeen: boolean;

  @Column({ type: "boolean", default: true })
  notifySubscribersOnUpload: boolean;

  // ─── LemonSqueezy subscription state ───
  // The LS customer attached to this user. We don't pre-create — LS makes
  // one on the first checkout — so we just record the ID we see in webhooks.
  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true })
  lemonCustomerId: string | null;

  // Latest active or recently-active subscription. Null when the user has
  // never subscribed. Kept around after cancel so we can show "ends on …".
  @Index()
  @Column({ type: "varchar", nullable: true })
  lemonSubscriptionId: string | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "free" })
  subscriptionTier: SubscriptionTier;

  @Column({ type: "varchar", length: 16, default: "inactive" })
  subscriptionStatus: SubscriptionStatus;

  // When the current paid period ends. For an active sub this is the next
  // renewal date; for a canceled-but-still-paid sub this is when access
  // actually expires.
  @Column({ type: "timestamptz", nullable: true })
  subscriptionPeriodEnd: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
