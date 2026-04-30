import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Video } from "../videos/video.entity";

@Entity("thumbnails")
export class Thumbnail {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  videoId: string;

  @ManyToOne(() => Video, (v) => v.thumbnails, { onDelete: "CASCADE" })
  @JoinColumn({ name: "videoId" })
  video: Video;

  @Column()
  s3Key: string;

  @CreateDateColumn()
  createdAt: Date;
}
