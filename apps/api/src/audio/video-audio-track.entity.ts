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
import { AudioTemplate } from "./audio-template.entity";

// One row per overlay attached to a video. The video keeps its native audio
// track in the file itself; whether that plays is controlled by the
// `mainAudioMuted` flag on Video, not by a row here.
@Entity("video_audio_tracks")
export class VideoAudioTrack {
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
  audioTemplateId: string;

  @ManyToOne(() => AudioTemplate, { onDelete: "CASCADE" })
  @JoinColumn({ name: "audioTemplateId" })
  audioTemplate: AudioTemplate;

  // When (in video timeline seconds) the overlay should start playing.
  @Column({ type: "real", default: 0 })
  startSeconds: number;

  // 0..1. Per-track gain applied client-side via the <audio> element.
  @Column({ type: "real", default: 1 })
  volume: number;

  @CreateDateColumn()
  createdAt: Date;
}
