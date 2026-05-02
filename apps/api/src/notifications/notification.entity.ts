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
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { Folder } from "../folders/folder.entity";

export type NotificationType =
  | "video_like"
  | "gif_like"
  | "video_upload"
  | "gif_upload"
  | "subscribe"
  | "folder_share";

// One row per (recipient, actor, subject) — toggling a like off and on again
// reuses the existing row instead of stacking duplicates. The compound index
// also doubles as the lookup path for delete-on-unlike.
@Entity("notifications")
@Index("notifications_recipient_unread_idx", ["recipientId", "readAt"])
@Index("notifications_dedupe_video_idx", ["recipientId", "actorId", "videoId", "type"], {
  unique: true,
  where: '"videoId" IS NOT NULL',
})
@Index("notifications_dedupe_gif_idx", ["recipientId", "actorId", "gifId", "type"], {
  unique: true,
  where: '"gifId" IS NOT NULL',
})
// Subscribe notifications have no subject (no video/gif), just (recipient,
// actor) — partial index ensures at most one "X subscribed to you" row per
// pair, so a quick unsub+resub doesn't double up.
@Index("notifications_dedupe_subscribe_idx", ["recipientId", "actorId", "type"], {
  unique: true,
  where: "type = 'subscribe'",
})
// Folder-share notifications dedupe per (recipient, actor, folder) so an
// owner re-sharing the same folder after a recipient leave doesn't stack
// duplicates.
@Index(
  "notifications_dedupe_folder_share_idx",
  ["recipientId", "actorId", "folderId", "type"],
  { unique: true, where: '"folderId" IS NOT NULL' },
)
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  recipientId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipientId" })
  recipient: User;

  @Column({ type: "uuid" })
  actorId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "actorId" })
  actor: User;

  @Column({ type: "varchar", length: 24 })
  type: NotificationType;

  @Column({ type: "uuid", nullable: true })
  videoId: string | null;

  @ManyToOne(() => Video, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "videoId" })
  video: Video | null;

  @Column({ type: "uuid", nullable: true })
  gifId: string | null;

  @ManyToOne(() => Gif, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "gifId" })
  gif: Gif | null;

  // Subject for folder_share notifications. Cascade-delete so removing
  // a folder also clears its share notifications.
  @Column({ type: "uuid", nullable: true })
  folderId: string | null;

  @ManyToOne(() => Folder, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "folderId" })
  folder: Folder | null;

  @Column({ type: "timestamptz", nullable: true })
  readAt: Date | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
