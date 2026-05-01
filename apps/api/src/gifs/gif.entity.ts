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
