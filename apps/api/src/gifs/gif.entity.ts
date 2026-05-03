import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Tag } from "../tags/tag.entity";

export type GifStatus = "uploading" | "ready";
export type GifVisibility = "public" | "private";
// How the GIF entered the system. "telegram" means the bot uploaded it
// on the user's behalf — surfaced as a badge on cards and a per-user
// count on the public profile page. New rows from the website default
// to "web".
export type GifSource = "web" | "telegram";

const bigintToNumber = {
  from: (v: string | null) => (v == null ? null : Number(v)),
  to: (v: number | null) => v,
};

@Entity("gifs")
export class Gif {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  ownerId: string;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "ownerId" })
  owner: User;

  @Column()
  title: string;

  @Column({ type: "text", default: "" })
  description: string;

  @Column()
  s3Key: string;

  // MP4 transcode of the GIF, generated on upload and used by the
  // Telegram inline-query handler (InlineQueryResultMpeg4Gif). Telegram
  // silently drops gif inline results > 1 MB, while mpeg4_gif accepts
  // the much smaller H.264-encoded version. Nullable because old rows
  // pre-date the column and lazy-backfill on demand.
  @Column({ type: "text", nullable: true })
  mp4S3Key: string | null;

  // First-frame JPEG used as `thumbnail_url` on the inline result.
  // Telegram's previewer silently drops mpeg4_gif results whose
  // thumbnail it can't render — `thumbnail_mime_type: "video/mp4"`
  // is technically allowed but unreliable, so every shipping GIF bot
  // (Gif, Tenor, …) serves a static JPEG here. Generated alongside
  // the MP4 in the same lazy transcode.
  @Column({ type: "text", nullable: true })
  thumbS3Key: string | null;

  // Real pixel dimensions + duration of the MP4 transcode, populated
  // by ffprobe on the same path as the encode (and lazily backfilled
  // on the inline-query path for rows that pre-date these columns).
  // The Telegram inline-query handler hands these to clients as
  // `mpeg4_width` / `mpeg4_height` / `mpeg4_duration`. iOS Telegram
  // lays out the inline picker grid cells eagerly from the dimension
  // values — when we hardcoded 320×240 for everything, a 16:9 source
  // rendered into a 4:3 cell and the JPEG thumbnail silently failed
  // to display, which was the "black picker on iOS while desktop
  // works" symptom. Nullable so existing rows keep working through
  // the lazy backfill window.
  @Column({ type: "int", nullable: true })
  mpeg4Width: number | null;

  @Column({ type: "int", nullable: true })
  mpeg4Height: number | null;

  @Column({ type: "real", nullable: true })
  mpeg4DurationSeconds: number | null;

  @Column({ type: "bigint", nullable: true, transformer: bigintToNumber })
  sizeBytes: number | null;

  @Column({ type: "real", nullable: true })
  durationSeconds: number | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "uploading" })
  status: GifStatus;

  @Index()
  @Column({ type: "varchar", length: 16, default: "public" })
  visibility: GifVisibility;

  @Index()
  @Column({ type: "varchar", length: 16, default: "web" })
  source: GifSource;

  @ManyToMany(() => Tag, { eager: true, cascade: true })
  @JoinTable({
    name: "gif_tags",
    joinColumn: { name: "gifId" },
    inverseJoinColumn: { name: "tagId" },
  })
  tags: Tag[];

  @Column({ type: "int", default: 0 })
  viewCount: number;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
