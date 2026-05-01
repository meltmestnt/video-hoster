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

export type AudioTemplateStatus = "uploading" | "ready";

const bigintToNumber = {
  from: (v: string | null) => (v == null ? null : Number(v)),
  to: (v: number | null) => v,
};

@Entity("audio_templates")
export class AudioTemplate {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
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

  // Decoded duration in seconds (best-effort — may stay null if the client
  // didn't probe). Used to clamp overlay startSeconds in the editor.
  @Column({ type: "real", nullable: true })
  durationSeconds: number | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "uploading" })
  status: AudioTemplateStatus;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
