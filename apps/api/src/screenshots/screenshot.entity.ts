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

export type ScreenshotStatus = "uploading" | "ready";
export type ScreenshotVisibility = "public" | "private";
export type ScreenshotSource = "video" | "gif" | "manual";

const bigintToNumber = {
  from: (v: string | null) => (v == null ? null : Number(v)),
  to: (v: number | null) => v,
};

@Entity("screenshots")
export class Screenshot {
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

  @Column()
  s3Key: string;

  @Column()
  mimeType: string;

  @Column({ type: "bigint", nullable: true, transformer: bigintToNumber })
  sizeBytes: number | null;

  @Column({ type: "int", nullable: true })
  width: number | null;

  @Column({ type: "int", nullable: true })
  height: number | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "uploading" })
  status: ScreenshotStatus;

  @Index()
  @Column({ type: "varchar", length: 16, default: "public" })
  visibility: ScreenshotVisibility;

  @Column({ type: "varchar", length: 16, default: "manual" })
  source: ScreenshotSource;

  @Column({ type: "int", default: 0 })
  viewCount: number;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
