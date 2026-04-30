import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Tag } from "../tags/tag.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";

export type VideoStatus = "uploading" | "ready";
export type VideoVisibility = "public" | "private";

const bigintToNumber = {
  from: (v: string | null) => (v == null ? null : Number(v)),
  to: (v: number | null) => v,
};

@Entity("videos")
export class Video {
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

  @Column()
  mimeType: string;

  @Column({ type: "bigint", nullable: true, transformer: bigintToNumber })
  sizeBytes: number | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "uploading" })
  status: VideoStatus;

  @Index()
  @Column({ type: "varchar", length: 16, default: "public" })
  visibility: VideoVisibility;

  @ManyToMany(() => Tag, { eager: true, cascade: true })
  @JoinTable({
    name: "video_tags",
    joinColumn: { name: "videoId" },
    inverseJoinColumn: { name: "tagId" },
  })
  tags: Tag[];

  @OneToMany(() => Thumbnail, (t) => t.video, { cascade: true })
  thumbnails: Thumbnail[];

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
