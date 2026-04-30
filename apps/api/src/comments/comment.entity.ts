import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../users/user.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";

// Comments live on either a video OR a gif. Exactly one of the two FKs
// is set on each row; the application layer enforces that invariant.
@Entity("comments")
export class Comment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  videoId: string | null;

  @ManyToOne(() => Video, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "videoId" })
  video: Video | null;

  @Index()
  @Column({ type: "uuid", nullable: true })
  gifId: string | null;

  @ManyToOne(() => Gif, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "gifId" })
  gif: Gif | null;

  @Index()
  @Column({ type: "uuid", nullable: true })
  parentId: string | null;

  @ManyToOne(() => Comment, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "parentId" })
  parent: Comment | null;

  @Column({ type: "uuid" })
  authorId: string;

  @ManyToOne(() => User, { eager: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "authorId" })
  author: User;

  @Column({ type: "text" })
  body: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
