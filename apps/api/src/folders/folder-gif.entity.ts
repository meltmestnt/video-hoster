import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from "typeorm";
import { Folder } from "./folder.entity";
import { Gif } from "../gifs/gif.entity";

/**
 * Many-to-many join between folders and gifs. Composite PK
 * (folderId, gifId) makes membership inherently idempotent — adding the
 * same gif twice is a no-op (or, with `INSERT ... ON CONFLICT DO
 * NOTHING`, a benign upsert). Deleting a folder cascades through this
 * row; deleting a gif likewise removes its membership in every folder.
 */
@Entity("folder_gifs")
export class FolderGif {
  @PrimaryColumn({ type: "uuid" })
  folderId: string;

  @ManyToOne(() => Folder, { onDelete: "CASCADE" })
  @JoinColumn({ name: "folderId" })
  folder: Folder;

  @Index()
  @PrimaryColumn({ type: "uuid" })
  gifId: string;

  @ManyToOne(() => Gif, { onDelete: "CASCADE" })
  @JoinColumn({ name: "gifId" })
  gif: Gif;

  @CreateDateColumn()
  addedAt: Date;
}
