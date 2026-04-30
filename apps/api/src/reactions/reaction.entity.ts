import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { User } from "../users/user.entity";
import { Video } from "../videos/video.entity";

export type ReactionType = "like" | "dislike";

@Entity("video_reactions")
@Unique(["videoId", "userId"])
export class VideoReaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  videoId: string;

  @ManyToOne(() => Video, { onDelete: "CASCADE" })
  @JoinColumn({ name: "videoId" })
  video: Video;

  @Index()
  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar", length: 8 })
  type: ReactionType;

  @CreateDateColumn()
  createdAt: Date;
}
