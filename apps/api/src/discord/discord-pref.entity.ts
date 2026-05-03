import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Per-Discord-user bot preferences. Lives in its own table so it
 * survives unlink/relink and so a Discord-only user (never linked
 * an account but still issuing slash commands) doesn't need a row
 * in discord_links.
 */
@Entity("discord_prefs")
export class DiscordPref {
  @PrimaryColumn({ type: "varchar", length: 32 })
  discordUserId: string;

  // Optional active folder used to scope `/gif` autocomplete and
  // route bot uploads. Nullable with no FK — if the folder is deleted
  // out from under the user, the bot falls back to "no active folder"
  // rather than orphaning the row.
  @Column({ type: "uuid", nullable: true })
  activeFolderId: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
