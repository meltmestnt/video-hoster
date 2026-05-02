import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Folder } from "./folder.entity";
import { FolderGif } from "./folder-gif.entity";
import { FolderShare } from "./folder-share.entity";
import { Gif } from "../gifs/gif.entity";
import { User } from "../users/user.entity";

const MAX_FOLDERS_PER_USER = 50;
const MAX_NAME_LEN = 80;
const MAX_SHARES_PER_FOLDER = 50;

export interface FolderSummary {
  id: string;
  name: string;
  gifCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedFolderSummary extends FolderSummary {
  sharedAt: Date;
  owner: { id: string; name: string };
}

export interface FolderShareRecipient {
  shareId: string;
  user: { id: string; name: string; email: string };
  sharedAt: Date;
}

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @InjectRepository(Folder)
    private readonly folders: Repository<Folder>,
    @InjectRepository(FolderGif)
    private readonly folderGifs: Repository<FolderGif>,
    @InjectRepository(FolderShare)
    private readonly folderShares: Repository<FolderShare>,
    @InjectRepository(Gif)
    private readonly gifs: Repository<Gif>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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
    args: {
      cursor?: string | null;
      limit: number;
      // Optional in-folder text filter — title ILIKE OR any tag ILIKE.
      // Empty string is treated as "no filter" so a cleared search box
      // doesn't reach the DB as "%%".
      q?: string | null;
      // Optional exact-tag filter, lowercased to match how tags are
      // stored. Combines AND with `q` when both are set, so the user
      // can chip-filter to "cat" and then search inside that subset.
      tag?: string | null;
    },
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    // Owner OR recipient — share grants read-only access to the same
    // listing. Mutations (addGif/removeGif/rename/delete) still
    // require owner via findOwned.
    await this.findReadable(folderId, userId);
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const trimmedQ = (args.q ?? "").trim();
    const trimmedTag = (args.tag ?? "").trim().toLowerCase();
    const filtering = trimmedQ.length > 0 || trimmedTag.length > 0;

    // The base list query joins folder_gifs to itself and orders by
    // addedAt; the filtered variant joins gifs (for the title) plus
    // optionally gif_tags / tags (for the predicate). Keep them split
    // so the unfiltered hot path stays the original tight query.
    const qb = this.folderGifs
      .createQueryBuilder("fg")
      .select(["fg.gifId AS \"gifId\"", "fg.addedAt AS \"addedAt\""])
      .where(`fg."folderId" = :folderId`, { folderId })
      .orderBy(`fg."addedAt"`, "DESC")
      .addOrderBy(`fg."gifId"`, "DESC")
      .take(limit + 1);

    if (filtering) {
      qb.innerJoin("gifs", "g", `g.id = fg."gifId"`);
      if (trimmedQ.length > 0) {
        const escaped = trimmedQ.replace(/[\\%_]/g, (c) => `\\${c}`);
        qb.andWhere(
          `(g.title ILIKE :qLike OR EXISTS (
             SELECT 1 FROM gif_tags gt2
             JOIN tags t2 ON t2.id = gt2."tagId"
             WHERE gt2."gifId" = g.id AND t2.name ILIKE :qLike
           ))`,
          { qLike: `%${escaped}%` },
        );
      }
      if (trimmedTag.length > 0) {
        // Exact-name match — chips come from listFolderTags, which
        // returns canonical lowercased names, so a strict equality
        // here keeps the chip → result mapping deterministic.
        qb.andWhere(
          `EXISTS (
             SELECT 1 FROM gif_tags gt3
             JOIN tags t3 ON t3.id = gt3."tagId"
             WHERE gt3."gifId" = g.id AND t3.name = :tagName
           )`,
          { tagName: trimmedTag },
        );
      }
    }

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
   * Top-N tags inside a folder, ordered by gif count desc then name
   * asc as a deterministic tiebreaker. Powers the chip row at the top
   * of the folder detail page — one-tap filters scoped to whatever's
   * in this folder, instead of the global tag space.
   *
   * Read-only via `findReadable` so a recipient with a shared folder
   * sees the same chip set the owner does.
   */
  async listFolderTags(
    userId: string,
    folderId: string,
    limit: number,
  ): Promise<Array<{ name: string; count: number }>> {
    await this.findReadable(folderId, userId);
    const cap = Math.max(1, Math.min(limit ?? 20, 50));
    const rows = await this.folderGifs.manager.query<
      Array<{ name: string; count: string }>
    >(
      `SELECT t.name AS name, COUNT(*)::int AS count
         FROM folder_gifs fg
         JOIN gif_tags gt ON gt."gifId" = fg."gifId"
         JOIN tags t ON t.id = gt."tagId"
        WHERE fg."folderId" = $1
        GROUP BY t.name
        ORDER BY COUNT(*) DESC, t.name ASC
        LIMIT $2`,
      [folderId, cap],
    );
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
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

  // ─── Sharing ────────────────────────────────────────────────────────
  //
  // Live read-only access: every read still goes through folders +
  // folder_gifs, so when the owner adds/removes a gif the recipient
  // sees the change instantly. The folder_shares table just gates who
  // can read.

  /**
   * Resolve a folder and confirm the caller can READ it (owner or
   * recipient of an active share). Same NotFound semantics as
   * findOwned for non-recipients — don't leak existence.
   */
  async findReadable(
    folderId: string,
    viewerId: string,
  ): Promise<{ folder: Folder; role: "owner" | "recipient" }> {
    const f = await this.folders.findOne({ where: { id: folderId } });
    if (!f) throw new NotFoundException("Folder not found");
    if (f.ownerId === viewerId) return { folder: f, role: "owner" };
    const share = await this.folderShares.findOne({
      where: { folderId, recipientUserId: viewerId },
      select: { id: true },
    });
    if (share) return { folder: f, role: "recipient" };
    throw new NotFoundException("Folder not found");
  }

  /**
   * Share a folder with another user by handle (email or name match).
   * Idempotent: re-sharing the same pair returns the existing share id
   * rather than throwing. Owner can't share with themselves.
   */
  async shareWithUser(
    ownerId: string,
    folderId: string,
    recipientHandle: string,
  ): Promise<{
    shareId: string;
    recipient: { id: string; name: string; email: string };
    folder: { id: string; name: string };
    alreadyShared: boolean;
  }> {
    const folder = await this.findOwned(folderId, ownerId);
    const handle = recipientHandle.trim();
    if (!handle) {
      throw new BadRequestException("Recipient handle cannot be empty");
    }
    // Prefer email match (unique), fall back to exact name. Case-
    // insensitive on both. Refuse partial matches — sharing with
    // "alex" shouldn't pick a random Alex.
    const lc = handle.toLowerCase();
    const recipient = await this.users
      .createQueryBuilder("u")
      .where("LOWER(u.email) = :lc OR LOWER(u.name) = :lc", { lc })
      .select(["u.id", "u.name", "u.email"])
      .getOne();
    if (!recipient) {
      throw new NotFoundException(`No user found matching "${handle}"`);
    }
    if (recipient.id === ownerId) {
      throw new BadRequestException("You can't share a folder with yourself");
    }
    const existing = await this.folderShares.findOne({
      where: { folderId, recipientUserId: recipient.id },
    });
    if (existing) {
      return {
        shareId: existing.id,
        recipient: {
          id: recipient.id,
          name: recipient.name,
          email: recipient.email,
        },
        folder: { id: folder.id, name: folder.name },
        alreadyShared: true,
      };
    }
    // Soft cap on per-folder share count — protects against a
    // mass-share script and keeps the per-folder share list UI
    // bounded.
    const shareCount = await this.folderShares.count({ where: { folderId } });
    if (shareCount >= MAX_SHARES_PER_FOLDER) {
      throw new ConflictException(
        `This folder is already shared with ${MAX_SHARES_PER_FOLDER} people — remove one before adding another.`,
      );
    }
    const created = await this.folderShares.save(
      this.folderShares.create({
        folderId,
        recipientUserId: recipient.id,
        sharerUserId: ownerId,
      }),
    );
    this.logger.log(
      `folders.share ownerId=${ownerId} folderId=${folderId} recipientId=${recipient.id}`,
    );
    return {
      shareId: created.id,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
      },
      folder: { id: folder.id, name: folder.name },
      alreadyShared: false,
    };
  }

  /** Owner-side revoke of a specific recipient's access. */
  async unshare(
    ownerId: string,
    folderId: string,
    recipientUserId: string,
  ): Promise<void> {
    await this.findOwned(folderId, ownerId);
    await this.folderShares.delete({ folderId, recipientUserId });
    this.logger.log(
      `folders.unshare ownerId=${ownerId} folderId=${folderId} recipientId=${recipientUserId}`,
    );
  }

  /**
   * Recipient-side opt-out — same effect as the owner unshare from
   * the recipient's perspective, but only the recipient themselves can
   * call it. Useful for "hide this from my list" without bothering the
   * owner.
   */
  async leaveShare(
    recipientUserId: string,
    folderId: string,
  ): Promise<void> {
    await this.folderShares.delete({ folderId, recipientUserId });
    this.logger.log(
      `folders.leaveShare recipientId=${recipientUserId} folderId=${folderId}`,
    );
  }

  /** Folders shared with `userId` — for the "Shared with me" page. */
  async listSharedWithMe(
    userId: string,
  ): Promise<SharedFolderSummary[]> {
    const rows = await this.folderShares
      .createQueryBuilder("fs")
      .innerJoin("folders", "f", `f.id = fs."folderId"`)
      .innerJoin("users", "u", `u.id = f."ownerId"`)
      .leftJoin("folder_gifs", "fg", `fg."folderId" = f.id`)
      .select([
        `f.id AS "id"`,
        `f.name AS "name"`,
        `f."createdAt" AS "createdAt"`,
        `f."updatedAt" AS "updatedAt"`,
        `fs."sharedAt" AS "sharedAt"`,
        `u.id AS "ownerId"`,
        `u.name AS "ownerName"`,
      ])
      .addSelect(`COUNT(fg."gifId")::int`, "gifCount")
      .where(`fs."recipientUserId" = :userId`, { userId })
      .groupBy(`f.id, fs."sharedAt", u.id`)
      .orderBy(`fs."sharedAt"`, "DESC")
      .getRawMany<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        sharedAt: Date;
        ownerId: string;
        ownerName: string;
        gifCount: number;
      }>();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      sharedAt: r.sharedAt,
      gifCount: Number(r.gifCount ?? 0),
      owner: { id: r.ownerId, name: r.ownerName },
    }));
  }

  /** Recipients of a folder — owner-only view. */
  async listShares(
    ownerId: string,
    folderId: string,
  ): Promise<FolderShareRecipient[]> {
    await this.findOwned(folderId, ownerId);
    const rows = await this.folderShares
      .createQueryBuilder("fs")
      .innerJoin("users", "u", `u.id = fs."recipientUserId"`)
      .where(`fs."folderId" = :folderId`, { folderId })
      .select([
        `fs.id AS "shareId"`,
        `fs."sharedAt" AS "sharedAt"`,
        `u.id AS "userId"`,
        `u.name AS "userName"`,
        `u.email AS "userEmail"`,
      ])
      .orderBy(`fs."sharedAt"`, "DESC")
      .getRawMany<{
        shareId: string;
        sharedAt: Date;
        userId: string;
        userName: string;
        userEmail: string;
      }>();
    return rows.map((r) => ({
      shareId: r.shareId,
      sharedAt: r.sharedAt,
      user: { id: r.userId, name: r.userName, email: r.userEmail },
    }));
  }

  /** Recipient ids for a single folder, used by listGifs ACL etc. */
  async recipientIdsForFolder(folderId: string): Promise<string[]> {
    const rows = await this.folderShares.find({
      where: { folderId },
      select: { recipientUserId: true },
    });
    return rows.map((r) => r.recipientUserId);
  }

  // ─── Admin helpers ──────────────────────────────────────────────────
  // Used by the admin folder browser. Bypass ownership checks because
  // the caller has already been gated through adminProcedure.

  async adminListAll(args: {
    cursor?: string | null;
    limit: number;
    q?: string | null;
  }): Promise<{
    items: Array<{
      id: string;
      name: string;
      gifCount: number;
      shareCount: number;
      createdAt: Date;
      owner: { id: string; name: string; email: string };
    }>;
    nextCursor: string | null;
  }> {
    const limit = Math.max(1, Math.min(args.limit ?? 30, 100));
    const qb = this.folders
      .createQueryBuilder("f")
      .innerJoin("users", "u", `u.id = f."ownerId"`)
      .leftJoin("folder_gifs", "fg", `fg."folderId" = f.id`)
      .leftJoin("folder_shares", "fs", `fs."folderId" = f.id`)
      .select([
        `f.id AS "id"`,
        `f.name AS "name"`,
        `f."createdAt" AS "createdAt"`,
        `u.id AS "ownerId"`,
        `u.name AS "ownerName"`,
        `u.email AS "ownerEmail"`,
      ])
      .addSelect(`COUNT(DISTINCT fg."gifId")::int`, "gifCount")
      .addSelect(`COUNT(DISTINCT fs.id)::int`, "shareCount")
      .groupBy(`f.id, u.id`)
      .orderBy(`f."createdAt"`, "DESC")
      .limit(limit + 1);
    if (args.q && args.q.trim()) {
      const lc = `%${args.q.trim().toLowerCase()}%`;
      qb.where(
        `LOWER(f.name) LIKE :lc OR LOWER(u.name) LIKE :lc OR LOWER(u.email) LIKE :lc`,
        { lc },
      );
    }
    if (args.cursor) {
      const prev = await this.folders.findOne({ where: { id: args.cursor } });
      if (prev) {
        qb.andWhere(`f."createdAt" < :cAt`, { cAt: prev.createdAt });
      }
    }
    const rows = await qb.getRawMany<{
      id: string;
      name: string;
      createdAt: Date;
      ownerId: string;
      ownerName: string;
      ownerEmail: string;
      gifCount: number;
      shareCount: number;
    }>();
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: sliced.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        gifCount: Number(r.gifCount ?? 0),
        shareCount: Number(r.shareCount ?? 0),
        owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail },
      })),
      nextCursor:
        hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null,
    };
  }

  /** Admin paginated read of a folder's gif ids — bypasses ownership. */
  async adminListGifIds(
    folderId: string,
    cursor: string | null | undefined,
    limit: number,
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    const f = await this.folders.findOne({ where: { id: folderId } });
    if (!f) throw new NotFoundException("Folder not found");
    const take = Math.max(1, Math.min(limit ?? 20, 100));
    const qb = this.folderGifs
      .createQueryBuilder("fg")
      .select(["fg.gifId AS \"gifId\"", "fg.addedAt AS \"addedAt\""])
      .where(`fg."folderId" = :folderId`, { folderId })
      .orderBy(`fg."addedAt"`, "DESC")
      .addOrderBy(`fg."gifId"`, "DESC")
      .take(take + 1);
    if (cursor) {
      const prev = await this.folderGifs.findOne({
        where: { folderId, gifId: cursor },
      });
      if (prev) {
        qb.andWhere(
          `(fg."addedAt", fg."gifId") < (:addedAt, :gifId)`,
          { addedAt: prev.addedAt, gifId: prev.gifId },
        );
      }
    }
    const rows = await qb.getRawMany<{ gifId: string }>();
    const hasMore = rows.length > take;
    const ids = (hasMore ? rows.slice(0, take) : rows).map((r) => r.gifId);
    return {
      ids,
      nextCursor: hasMore && ids.length > 0 ? ids[ids.length - 1] : null,
    };
  }

  /** Admin override of `delete` — no ownership check. */
  async adminDelete(folderId: string): Promise<void> {
    const f = await this.folders.findOne({ where: { id: folderId } });
    if (!f) throw new NotFoundException("Folder not found");
    await this.folders.delete({ id: folderId });
    this.logger.log(`[ADMIN] folders.delete folderId=${folderId}`);
  }

  /** Admin override of `removeGif` — no ownership check. */
  async adminRemoveGif(folderId: string, gifId: string): Promise<void> {
    await this.folderGifs.delete({ folderId, gifId });
    this.logger.log(
      `[ADMIN] folders.removeGif folderId=${folderId} gifId=${gifId}`,
    );
  }
}
