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
