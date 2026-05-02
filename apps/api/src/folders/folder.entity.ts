import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../users/user.entity";

/**
 * User-owned organizational folders for GIFs. Pure organization, not a
 * permissions construct: folder membership is independent of a gif's
 * `visibility` column. A public gif can sit in any number of users'
 * folders; a private gif can sit only in folders owned by its uploader.
 *
 * The Telegram bot uses each user's "active folder" preference (stored
 * on TelegramPref) to scope inline search and route uploads, so creating
 * a folder doubles as a way to carve out a personal sub-library that's
 * the bot's universe.
 */
@Entity("folders")
@Index(["ownerId", "name"])
export class Folder {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @Column({ type: "varchar", length: 80 })
  name: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
