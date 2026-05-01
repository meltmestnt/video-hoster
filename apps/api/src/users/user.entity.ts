import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export type UserStatus = "verified" | "unverified";
export type UserRole = "admin" | "user";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", nullable: true })
  googleId: string | null;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  name: string;

  @Column({ type: "text", nullable: true })
  avatarUrl: string | null;

  @Column({ type: "text", nullable: true })
  avatarS3Key: string | null;

  @Column({ type: "text", nullable: true, select: false })
  passwordHash: string | null;

  @Index()
  @Column({ type: "varchar", length: 16, default: "unverified" })
  status: UserStatus;

  @Index()
  @Column({ type: "varchar", length: 16, default: "user" })
  role: UserRole;

  @Index()
  @Column({ type: "varchar", length: 64, nullable: true })
  confirmationTokenHash: string | null;

  @Column({ type: "timestamptz", nullable: true })
  confirmationTokenExpiresAt: Date | null;

  @Column({ type: "boolean", default: true })
  miniPlayerEnabled: boolean;

  @Column({ type: "boolean", default: false })
  miniPlayerPromptSeen: boolean;

  @Column({ type: "boolean", default: true })
  notifySubscribersOnUpload: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
