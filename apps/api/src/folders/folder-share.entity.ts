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
import { Folder } from "./folder.entity";
import { User } from "../users/user.entity";

/**
 * Read-only access grant from the folder's owner to another user.
 * Live (not a copy): every read goes through the same folder + folder_gifs
 * tables, so when the owner adds or removes a gif the recipient sees the
 * change instantly. Cascades on either side delete cleanly when an owner
 * deletes the folder or a recipient deletes their account.
 */
@Entity("folder_shares")
@Unique("folder_shares_unique_pair", ["folderId", "recipientUserId"])
@Index("folder_shares_recipient_idx", ["recipientUserId"])
export class FolderShare {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  folderId: string;

  @ManyToOne(() => Folder, { onDelete: "CASCADE" })
  @JoinColumn({ name: "folderId" })
  folder: Folder;

  @Column({ type: "uuid" })
  recipientUserId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "recipientUserId" })
  recipient: User;

  // Owner at the time of share — useful for "shared by X" headers and
  // for filtering shares made by a specific user. Cascade-null on user
  // delete so the share row itself survives if the original sharer is
  // gone (rare but possible).
  @Column({ type: "uuid", nullable: true })
  sharerUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "sharerUserId" })
  sharer: User | null;

  @CreateDateColumn()
  sharedAt: Date;
}
