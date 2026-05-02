import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Folder } from "./folder.entity";
import { FolderGif } from "./folder-gif.entity";
import { Gif } from "../gifs/gif.entity";

const MAX_FOLDERS_PER_USER = 50;
const MAX_NAME_LEN = 80;

export interface FolderSummary {
  id: string;
  name: string;
  gifCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @InjectRepository(Folder)
    private readonly folders: Repository<Folder>,
    @InjectRepository(FolderGif)
    private readonly folderGifs: Repository<FolderGif>,
    @InjectRepository(Gif)
    private readonly gifs: Repository<Gif>,
  ) {}

  /**
   * Resolve a folder and assert the caller owns it. Throws NotFound
   * (rather than Forbidden) for non-owners so we don't leak the existence
   * of someone else's folder via timing.
   */
  async findOwned(folderId: string, ownerId: string): Promise<Folder> {
    const f = await this.folders.findOne({ where: { id: folderId } });
    if (!f || f.ownerId !== ownerId) {
      throw new NotFoundException("Folder not found");
    }
    return f;
  }

  /** Lighter-weight ownership probe used in hot paths. */
  async ownsFolder(folderId: string, ownerId: string): Promise<boolean> {
    const f = await this.folders.findOne({
      where: { id: folderId },
      select: { id: true, ownerId: true },
    });
    return !!f && f.ownerId === ownerId;
  }

  /** All folders owned by `userId`, with current gif counts. */
  async listForOwner(userId: string): Promise<FolderSummary[]> {
    const rows = await this.folders
      .createQueryBuilder("f")
      .leftJoin("folder_gifs", "fg", `fg."folderId" = f.id`)
      .select([
        "f.id AS id",
        "f.name AS name",
        "f.createdAt AS \"createdAt\"",
        "f.updatedAt AS \"updatedAt\"",
      ])
      .addSelect(`COUNT(fg."gifId")::int`, "gifCount")
      .where("f.ownerId = :userId", { userId })
      .groupBy("f.id")
      .orderBy(`f.createdAt`, "DESC")
      .getRawMany<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        gifCount: number;
      }>();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      gifCount: Number(r.gifCount ?? 0),
    }));
  }

  async create(userId: string, name: string): Promise<FolderSummary> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException("Folder name cannot be empty");
    }
    if (trimmed.length > MAX_NAME_LEN) {
      throw new BadRequestException(
        `Folder name must be ${MAX_NAME_LEN} characters or fewer`,
      );
    }
    const existing = await this.folders.count({ where: { ownerId: userId } });
    if (existing >= MAX_FOLDERS_PER_USER) {
      throw new BadRequestException(
        `Folder limit reached (${MAX_FOLDERS_PER_USER} per user)`,
      );
    }
    const f = await this.folders.save(
      this.folders.create({ ownerId: userId, name: trimmed }),
    );
    this.logger.log(`folders.create userId=${userId} folderId=${f.id} name="${trimmed}"`);
    return {
      id: f.id,
      name: f.name,
      gifCount: 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    };
  }

  async rename(userId: string, folderId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException("Folder name cannot be empty");
    }
    if (trimmed.length > MAX_NAME_LEN) {
      throw new BadRequestException(
        `Folder name must be ${MAX_NAME_LEN} characters or fewer`,
      );
    }
    const f = await this.findOwned(folderId, userId);
    f.name = trimmed;
    await this.folders.save(f);
    this.logger.log(`folders.rename userId=${userId} folderId=${folderId}`);
  }

  async delete(userId: string, folderId: string): Promise<void> {
    await this.findOwned(folderId, userId);
    // CASCADE on folder_gifs handles join rows; the gifs themselves are
    // untouched so a delete doesn't destroy uploaded media.
    await this.folders.delete({ id: folderId });
    this.logger.log(`folders.delete userId=${userId} folderId=${folderId}`);
  }

  /**
   * Add a gif to a folder. Idempotent — re-adding the same gif is a
   * no-op rather than an error so the UI's "Add to folder" button can
   * fire freely. The folder must be owned by the caller; the gif must
   * either be public OR be owned by the caller (folder owner can curate
   * any public gif, but can't sneak a stranger's private gif into their
   * own folder).
   */
  async addGif(
    userId: string,
    folderId: string,
    gifId: string,
  ): Promise<void> {
    await this.findOwned(folderId, userId);
    const gif = await this.gifs.findOne({
      where: { id: gifId },
      select: { id: true, ownerId: true, visibility: true, status: true },
    });
    if (!gif) throw new NotFoundException("Gif not found");
    if (
      gif.visibility !== "public" &&
      gif.ownerId !== userId
    ) {
      throw new ForbiddenException(
        "Cannot add a gif you don't own to a folder",
      );
    }
    // ON CONFLICT DO NOTHING keeps the call idempotent. TypeORM's
    // ORM-level upsert path doesn't support composite PKs cleanly, so
    // we go raw here.
    await this.folderGifs.manager.query(
      `INSERT INTO folder_gifs ("folderId", "gifId", "addedAt")
       VALUES ($1, $2, NOW())
       ON CONFLICT ("folderId", "gifId") DO NOTHING`,
      [folderId, gifId],
    );
    this.logger.log(
      `folders.addGif userId=${userId} folderId=${folderId} gifId=${gifId}`,
    );
  }

  async removeGif(
    userId: string,
    folderId: string,
    gifId: string,
  ): Promise<void> {
    await this.findOwned(folderId, userId);
    await this.folderGifs.delete({ folderId, gifId });
    this.logger.log(
      `folders.removeGif userId=${userId} folderId=${folderId} gifId=${gifId}`,
    );
  }

  /**
   * Page through a folder's gif IDs in reverse chronological add order.
   * Returns ids only — the caller hydrates them via GifsService so all
   * the existing `attachExtras` logic (likes, viewer reaction, signed
   * URLs) flows through the same pipeline as the public feed.
   */
  async listGifIds(
    userId: string,
    folderId: string,
    args: { cursor?: string | null; limit: number },
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    await this.findOwned(folderId, userId);
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const qb = this.folderGifs
      .createQueryBuilder("fg")
      .select(["fg.gifId AS \"gifId\"", "fg.addedAt AS \"addedAt\""])
      .where(`fg."folderId" = :folderId`, { folderId })
      .orderBy(`fg."addedAt"`, "DESC")
      .addOrderBy(`fg."gifId"`, "DESC")
      .take(limit + 1);

    if (args.cursor) {
      // Cursor is the last seen `gifId` from the previous page; we paginate
      // by addedAt < cursor's addedAt OR same time + smaller id.
      const prev = await this.folderGifs.findOne({
        where: { folderId, gifId: args.cursor },
      });
      if (prev) {
        qb.andWhere(
          `(fg."addedAt", fg."gifId") < (:addedAt, :gifId)`,
          { addedAt: prev.addedAt, gifId: prev.gifId },
        );
      }
    }

    const rows = await qb.getRawMany<{ gifId: string }>();
    const hasMore = rows.length > limit;
    const ids = (hasMore ? rows.slice(0, limit) : rows).map((r) => r.gifId);
    const nextCursor =
      hasMore && ids.length > 0 ? ids[ids.length - 1] : null;
    return { ids, nextCursor };
  }

  /**
   * Bot-side helper: which gif IDs sit in this folder? Returns a Set so
   * callers can do O(1) membership checks while filtering search results.
   * No ownership check here — the caller (telegram bot inline handler)
   * has already resolved the folder via the user's TelegramPref, which
   * implicitly ties it back to the linked owner.
   */
  async gifIdSetForFolder(folderId: string): Promise<Set<string>> {
    const rows = await this.folderGifs.find({
      where: { folderId },
      select: { gifId: true },
    });
    return new Set(rows.map((r) => r.gifId));
  }

  /**
   * Returns the folder ids a given gif belongs to under `userId`. Used
   * by the gif card's "Add to folder" menu so we can pre-check the
   * folders this gif is already in.
   */
  async folderIdsForGif(
    userId: string,
    gifId: string,
  ): Promise<string[]> {
    const rows = await this.folderGifs
      .createQueryBuilder("fg")
      .innerJoin("folders", "f", `f.id = fg."folderId"`)
      .where(`f.ownerId = :userId`, { userId })
      .andWhere(`fg."gifId" = :gifId`, { gifId })
      .select(`fg."folderId"`, "folderId")
      .getRawMany<{ folderId: string }>();
    return rows.map((r) => r.folderId);
  }

  /** Bulk version used by gif lists to flag membership across many gifs. */
  async folderIdsByGif(
    userId: string,
    gifIds: string[],
  ): Promise<Map<string, string[]>> {
    if (gifIds.length === 0) return new Map();
    const rows = await this.folderGifs
      .createQueryBuilder("fg")
      .innerJoin("folders", "f", `f.id = fg."folderId"`)
      .where(`f.ownerId = :userId`, { userId })
      .andWhere(`fg."gifId" IN (:...gifIds)`, { gifIds })
      .select([`fg."gifId" AS "gifId"`, `fg."folderId" AS "folderId"`])
      .getRawMany<{ gifId: string; folderId: string }>();
    const out = new Map<string, string[]>();
    for (const r of rows) {
      const list = out.get(r.gifId) ?? [];
      list.push(r.folderId);
      out.set(r.gifId, list);
    }
    return out;
  }
}
