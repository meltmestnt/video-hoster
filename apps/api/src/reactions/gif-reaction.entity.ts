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
import { Gif } from "../gifs/gif.entity";
import type { ReactionType } from "./reaction.entity";

@Entity("gif_reactions")
@Unique(["gifId", "userId"])
export class GifReaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  gifId: string;

  @ManyToOne(() => Gif, { onDelete: "CASCADE" })
  @JoinColumn({ name: "gifId" })
  gif: Gif;

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
