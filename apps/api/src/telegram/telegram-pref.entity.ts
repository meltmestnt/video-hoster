import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

export type BotLocale = "uk" | "en";

/**
 * Per-Telegram-user bot preferences. Lives in its own table so it
 * survives unlink/relink cycles and so we can persist a locale for
 * users who only ever use inline search and never bind a website
 * account. The PK is the Telegram user id, kept as bigint string for
 * the same reason TelegramLink uses bigint.
 */
@Entity("telegram_prefs")
export class TelegramPref {
  @PrimaryColumn({ type: "bigint" })
  telegramUserId: string;

  @Column({ type: "varchar", length: 8, default: "uk" })
  locale: BotLocale;

  @UpdateDateColumn()
  updatedAt: Date;
}
