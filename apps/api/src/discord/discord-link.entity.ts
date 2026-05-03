import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";

/**
 * One row per (Discord user ↔ vidsandgifs account) binding. Mirrors
 * TelegramLink — same one-binding-per-Discord-user invariant. The
 * Discord user id is stored as a varchar because Discord snowflakes
 * are 64-bit ints serialized as decimal strings; bigint would work but
 * a string keeps us aligned with the discord.js API which already
 * hands them to us as strings.
 */
@Entity("discord_links")
export class DiscordLink {
  @PrimaryColumn({ type: "varchar", length: 32 })
  discordUserId: string;

  @Index()
  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  discordUsername: string | null;

  @CreateDateColumn()
  linkedAt: Date;
}
