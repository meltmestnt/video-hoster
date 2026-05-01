import {
  Check,
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

@Entity("subscriptions")
@Unique(["subscriberId", "targetUserId"])
// A user can never subscribe to themselves; enforced both here and in the
// service so a stray insert can't slip past application code.
@Check(`"subscriberId" <> "targetUserId"`)
export class Subscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  subscriberId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "subscriberId" })
  subscriber: User;

  @Index()
  @Column({ type: "uuid" })
  targetUserId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "targetUserId" })
  targetUser: User;

  @CreateDateColumn()
  createdAt: Date;
}
