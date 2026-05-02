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

  // Optional active folder used to scope inline search and route gif
  // uploads via the bot. Nullable column with no FK constraint — if the
  // folder is deleted out from under the user, we fall back to "no
  // active folder" rather than orphaning the row, so the bot keeps
  // working without manual cleanup.
  @Column({ type: "uuid", nullable: true })
  activeFolderId: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
