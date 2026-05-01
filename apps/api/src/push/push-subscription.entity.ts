import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../users/user.entity";

/**
 * One row per (browser, device) pair the user has granted Notification
 * permission on. The endpoint is what the push service (Mozilla, Apple,
 * Google FCM, …) hands us — it's globally unique, which is what we use
 * to dedupe across re-subscribes.
 *
 * `p256dh` and `auth` are the per-subscription encryption keys. Both
 * arrive as URL-safe base64 from the browser's PushSubscription.getKey()
 * call; we store them as-is and let `web-push` serialize.
 */
@Entity("push_subscriptions")
export class PushSubscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  // The endpoint is the per-subscription URL on the push service. It's
  // already globally unique, so a unique constraint here doubles as the
  // "is this device already subscribed?" check.
  @Index({ unique: true })
  @Column({ type: "text" })
  endpoint: string;

  @Column({ type: "text" })
  p256dh: string;

  @Column({ type: "text" })
  auth: string;

  // Optional UA so the user can recognize their devices in a future
  // "manage devices" UI ("Chrome on MacBook"). Not used for routing.
  @Column({ type: "text", nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
