import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

/**
 * One row per (Telegram user ↔ vidsandgifs account) binding. The Telegram
 * user id is the primary key — each Telegram user can map to at most one
 * vidsandgifs account at a time. Stored as bigint because Telegram user ids
 * exceed 32-bit ints.
 */
@Entity("telegram_links")
export class TelegramLink {
  @PrimaryColumn({ type: "bigint" })
  telegramUserId: string;

  @Index()
  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  telegramUsername: string | null;

  @CreateDateColumn()
  linkedAt: Date;
}
