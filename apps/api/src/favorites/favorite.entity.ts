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

@Entity("video_favorites")
@Unique(["videoId", "userId"])
export class VideoFavorite {
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

  @CreateDateColumn()
  createdAt: Date;
}
