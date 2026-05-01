import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository, SelectQueryBuilder } from "typeorm";
import {
  MAX_GIF_BYTES,
  UNAPPROVED_DAILY_GIF_LIMIT,
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_GIF_LIMIT,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
  type VideoSort,
} from "@repo/shared";
import { MoreThanOrEqual } from "typeorm";
import type { User } from "../users/user.entity";
import { Gif, GifVisibility } from "./gif.entity";
import { TagsService } from "../tags/tags.service";
import { S3Service } from "../s3/s3.service";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { MediaService } from "../media/media.service";
import { looksLikeGif } from "../s3/file-signatures";


interface CreateUploadArgs {
  ownerId: string;
  ownerStatus: User["status"];
  ownerApproved: boolean;
  title: string;
  description: string;
  sizeBytes: number;
  durationSeconds: number;
  tagNames: string[];
  visibility: GifVisibility;
}

interface FinalizeArgs {
  gifId: string;
  ownerId: string;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "gif";

@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);

  constructor(
    @InjectRepository(Gif) private readonly gifs: Repository<Gif>,
    private readonly tagsService: TagsService,
    private readonly s3: S3Service,
    private readonly reactionsService: ReactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly media: MediaService,
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (args.durationSeconds > 20.5) {
      throw new BadRequestException("GIF exceeds 20s duration limit");
    }

    if (args.ownerStatus !== "verified") {
      const existing = await this.gifs.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_GIF_LIMIT) {
        this.logger.warn(
          `gifs.createUpload rejected reason=unverified-limit ownerId=${args.ownerId} existing=${existing}`,
        );
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    // Verified-but-unapproved daily cap. Drafts count too so a stuck
    // "uploading" row from a failed earlier attempt doesn't permanently
    // bypass the limit.
    if (!args.ownerApproved) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.gifs.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_GIF_LIMIT) {
        this.logger.warn(
          `gifs.createUpload rejected reason=unapproved-daily-limit ownerId=${args.ownerId} recent=${recent}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    // One in-flight upload per user. A draft is considered abandoned once
    // the presigned PUT TTL has expired, so older "uploading" rows don't
    // block.
    const STALE_AFTER_MS = 30 * 60 * 1000;
    const inFlight = await this.gifs.findOne({
      where: { ownerId: args.ownerId, status: "uploading" },
      order: { createdAt: "DESC" },
    });
    if (
      inFlight &&
      Date.now() - inFlight.createdAt.getTime() < STALE_AFTER_MS
    ) {
      throw new ConflictException("You already have a gif upload in progress");
    }

    const tags = await this.tagsService.ensureTags(args.tagNames);
    const slug = slugify(args.title);

    const draft = this.gifs.create({
      ownerId: args.ownerId,
      title: args.title,
      description: args.description,
      s3Key: "",
      sizeBytes: args.sizeBytes,
      durationSeconds: args.durationSeconds,
      status: "uploading",
      visibility: args.visibility,
      tags,
    });
    const saved = await this.gifs.save(draft);

    const s3Key = `gifs/${saved.id}/${slug}.gif`;
    await this.gifs.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;

    const uploadUrl = await this.s3.presignPut(s3Key, "image/gif");
    this.logger.log(
      `gifs.createUpload ownerId=${args.ownerId} size=${args.sizeBytes} mime=image/gif visibility=${args.visibility} s3Key=${s3Key} gifId=${saved.id}`,
    );
    return { gifId: saved.id, s3Key, uploadUrl };
  }

  async finalizeUpload(args: FinalizeArgs) {
    const gif = await this.gifs.findOne({ where: { id: args.gifId } });
    if (!gif) throw new NotFoundException("Gif not found");
    if (gif.ownerId !== args.ownerId) {
      throw new BadRequestException("Not the owner");
    }
    const head = await this.s3.headObject(gif.s3Key);
    if (!head) {
      throw new BadRequestException("Gif object not found in S3");
    }
    if (head.size > MAX_GIF_BYTES) {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException("Uploaded gif exceeds 20 MB limit");
    }
    // Server-side type check: presigned PUT was for image/gif, but a
    // client could PUT a different MIME. Reject so the GIF page doesn't
    // end up serving e.g. a video or PDF.
    if (head.contentType && head.contentType !== "image/gif") {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException(
        `Uploaded object has type "${head.contentType}", not a GIF`,
      );
    }
    // Magic-byte check is the source of truth — the Content-Type metadata
    // was set client-side and can be lied about. Refuse anything whose
    // actual bytes don't begin with the GIF87a/89a header.
    const head6 = await this.s3.readObjectHead(gif.s3Key, 16);
    if (!head6 || !looksLikeGif(head6)) {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException(
        "Uploaded file does not look like a real GIF",
      );
    }
    gif.sizeBytes = head.size;
    gif.status = "ready";
    await this.gifs.save(gif);
    this.logger.log(
      `gifs.finalizeUpload ok ownerId=${gif.ownerId} gifId=${gif.id} size=${gif.sizeBytes}`,
    );
    if (gif.visibility === "public") {
      await this.notificationsService
        .onGifUploaded(gif.id, gif.ownerId)
        .catch((err) =>
          this.logger.warn(
            `Failed to notify subscribers of GIF upload ${gif.id}: ${(err as Error).message}`,
          ),
        );
    }
    return { ok: true };
  }

  /**
   * Server-side path used by the Telegram bot. Skips the
   * presign/finalize roundtrip because the bytes are already in process
   * memory — we still run the same size, magic-byte, and per-account-tier
   * limit checks the regular flow does, and the row lands in `ready` with
   * the same notifications fired.
   */
  async createFromBuffer(args: {
    ownerId: string;
    ownerStatus: User["status"];
    ownerApproved: boolean;
    title: string;
    buffer: Buffer;
  }): Promise<Gif> {
    if (args.buffer.length > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (!looksLikeGif(args.buffer.subarray(0, 16))) {
      throw new BadRequestException(
        "Uploaded file does not look like a real GIF",
      );
    }

    if (args.ownerStatus !== "verified") {
      const existing = await this.gifs.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_GIF_LIMIT) {
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }
    if (!args.ownerApproved) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.gifs.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_GIF_LIMIT) {
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    const slug = slugify(args.title);
    const draft = this.gifs.create({
      ownerId: args.ownerId,
      title: args.title,
      description: "",
      s3Key: "",
      sizeBytes: args.buffer.length,
      // Telegram doesn't tell us the duration of a GIF document. We don't
      // use it for any quota — leaving 0 is safe and lets the row pass the
      // not-null constraint.
      durationSeconds: 0,
      status: "uploading",
      visibility: "public",
      // Drives the "uploaded via Telegram" badge on cards/detail pages
      // and the count on the user's profile.
      source: "telegram",
      tags: [],
    });
    const saved = await this.gifs.save(draft);
    const s3Key = `gifs/${saved.id}/${slug}.gif`;
    await this.s3.uploadBuffer(s3Key, args.buffer, "image/gif");
    saved.s3Key = s3Key;
    saved.status = "ready";
    await this.gifs.save(saved);
    this.logger.log(
      `gifs.createFromBuffer ok ownerId=${args.ownerId} gifId=${saved.id} size=${args.buffer.length} source=telegram`,
    );
    this.notificationsService
      .onGifUploaded(saved.id, saved.ownerId)
      .catch((err) =>
        this.logger.warn(
          `Failed to notify subscribers of GIF upload ${saved.id}: ${(err as Error).message}`,
        ),
      );
    return saved;
  }

  /**
   * Lightweight projection used by the Telegram bot's inline-query handler.
   * Public + ready only, optional title/tag substring filter, no extras
   * computed (we don't need likes/views to render the inline gif card).
   */
  async searchInlineForBot(args: {
    q: string;
    limit: number;
  }): Promise<Array<{ id: string; title: string }>> {
    const qb = this.gifs
      .createQueryBuilder("g")
      .select(["g.id", "g.title"])
      .where("g.status = :s", { s: "ready" })
      .andWhere("g.visibility = :pub", { pub: "public" })
      .orderBy("g.createdAt", "DESC")
      .take(args.limit);
    const trimmed = args.q.trim();
    if (trimmed) {
      const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        `(g.title ILIKE :qLike OR EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name ILIKE :qLike
         ))`,
        { qLike: `%${escaped}%` },
      );
    }
    return qb.getMany();
  }

  async deleteGif(gifId: string, ownerId: string, isAdmin = false) {
    const gif = await this.gifs.findOne({ where: { id: gifId } });
    if (!gif) throw new NotFoundException("Gif not found");
    if (!isAdmin && gif.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    let s3CleanupRan = false;
    if (gif.s3Key) {
      s3CleanupRan = true;
      await this.s3.deleteObject(gif.s3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete gif S3 object ${gif.s3Key}: ${(err as Error).message}`,
        );
      });
    }
    await this.gifs.delete({ id: gifId });
    const adminPrefix = isAdmin && gif.ownerId !== ownerId ? "[ADMIN] " : "";
    this.logger.log(
      `${adminPrefix}gifs.deleteGif actorId=${ownerId} gifId=${gifId} ownerId=${gif.ownerId} isAdmin=${isAdmin} s3Cleanup=${s3CleanupRan}`,
    );
    return { ok: true };
  }

  async list({
    cursor,
    limit,
    viewerId,
    sort = "newest",
  }: {
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    sort?: VideoSort;
  }) {
    if (sort !== "newest") {
      const ids = await this.rankedIds({ sort, viewerId, limit });
      const items = await this.loadByIds(ids);
      return {
        items: await this.attachExtras(items, viewerId),
        nextCursor: null,
      };
    }
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);

    if (cursor) {
      const c = await this.gifs.findOne({ where: { id: cursor } });
      if (c) qb.andWhere("g.createdAt < :cAt", { cAt: c.createdAt });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor,
    };
  }

  /** Newest-first list of one owner's GIFs for /@username pages. */
  async listByOwner({
    ownerId,
    cursor,
    limit,
    viewerId,
    isAdmin = false,
  }: {
    ownerId: string;
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    isAdmin?: boolean;
  }) {
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .andWhere("g.ownerId = :ownerId", { ownerId })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    if (viewerId !== ownerId && !isAdmin) {
      qb.andWhere("g.visibility = :pub", { pub: "public" });
    }

    if (cursor) {
      const c = await this.gifs.findOne({ where: { id: cursor } });
      if (c) qb.andWhere("g.createdAt < :cAt", { cAt: c.createdAt });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor,
    };
  }

  async search({
    q,
    tag,
    limit,
    viewerId,
    sort = "newest",
  }: {
    q?: string;
    tag?: string;
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    sort?: VideoSort;
  }) {
    const trimmedQ = q?.trim() ?? "";
    const trimmedTag = tag?.trim() ?? "";
    if (!trimmedQ && !trimmedTag) {
      return { items: [], nextCursor: null };
    }
    if (sort !== "newest") {
      const ids = await this.rankedIds({
        sort,
        viewerId,
        limit,
        q: trimmedQ,
        tag: trimmedTag,
      });
      const items = await this.loadByIds(ids);
      return {
        items: await this.attachExtras(items, viewerId),
        nextCursor: null,
      };
    }

    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, trimmedQ, trimmedTag);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    };
  }

  /** Atomic +1 on the gif's view counter. Mirrors VideosService. */
  async incrementView(id: string): Promise<{ viewCount: number }> {
    const row = await this.gifs.findOne({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundException("Gif not found");
    if (row.status !== "ready") return { viewCount: 0 };
    const result = await this.gifs.manager.query<Array<{ viewCount: number }>>(
      `UPDATE gifs SET "viewCount" = "viewCount" + 1
       WHERE id = $1
       RETURNING "viewCount"`,
      [id],
    );
    return { viewCount: result[0]?.viewCount ?? 0 };
  }

  async byId(id: string, viewerId?: string | null, isAdmin = false) {
    const g = await this.gifs.findOne({
      where: { id },
      relations: ["owner", "tags"],
    });
    if (!g) throw new NotFoundException("Gif not found");
    if (g.visibility === "private" && g.ownerId !== viewerId && !isAdmin) {
      throw new NotFoundException("Gif not found");
    }
    const [enriched] = await this.attachExtras([g], viewerId);
    const gifUrl =
      g.status === "ready"
        ? await this.media.signUrl({ kind: "gif", id: g.id })
        : null;
    return { ...enriched, gifUrl };
  }

  async suggested(id: string, limit: number, viewerId?: string | null) {
    const g = await this.gifs.findOne({
      where: { id },
      relations: ["tags"],
    });
    if (!g) throw new NotFoundException("Gif not found");
    if (g.visibility === "private" && g.ownerId !== viewerId) {
      throw new NotFoundException("Gif not found");
    }
    const tagIds = g.tags.map((t) => t.id);
    if (tagIds.length === 0) return [];

    const qb = this.gifs
      .createQueryBuilder("g")
      .innerJoin("gif_tags", "gt", `gt."gifId" = g.id`)
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where(`gt."tagId" IN (:...tagIds)`, { tagIds })
      .andWhere("g.id != :id", { id })
      .andWhere("g.status = :s", { s: "ready" });

    this.applyVisibility(qb, viewerId);

    const rows = await qb
      .groupBy("g.id")
      .addGroupBy("owner.id")
      .addGroupBy("tags.id")
      .addSelect(`COUNT(gt."tagId")`, "shared")
      .orderBy("shared", "DESC")
      .addOrderBy("g.createdAt", "DESC")
      .limit(limit)
      .getMany();

    return this.attachExtras(rows, viewerId);
  }

  countByOwner(ownerId: string): Promise<number> {
    return this.gifs.count({ where: { ownerId, status: "ready" } });
  }

  async listPublicForSitemap(): Promise<
    Array<{ id: string; createdAt: Date }>
  > {
    return this.gifs.find({
      select: { id: true, createdAt: true },
      where: { status: "ready", visibility: "public" },
      order: { createdAt: "DESC" },
      take: 5000,
    });
  }

  private applyVisibility(
    qb: SelectQueryBuilder<Gif>,
    viewerId: string | null | undefined,
  ) {
    if (viewerId) {
      qb.andWhere("(g.visibility = :pub OR g.ownerId = :viewerId)", {
        pub: "public",
        viewerId,
      });
    } else {
      qb.andWhere("g.visibility = :pub", { pub: "public" });
    }
  }

  private applySearchFilters(
    qb: SelectQueryBuilder<Gif>,
    q: string,
    tag: string,
  ) {
    if (tag) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name = :tagName
         )`,
        { tagName: tag.toLowerCase() },
      );
    }
    if (q) {
      const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        `(g.title ILIKE :qLike OR EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name ILIKE :qLike
         ))`,
        { qLike: `%${escaped}%` },
      );
    }
  }

  private async rankedIds({
    sort,
    viewerId,
    limit,
    q = "",
    tag = "",
  }: {
    sort: Exclude<VideoSort, "newest">;
    viewerId: string | null | undefined;
    limit: number;
    q?: string;
    tag?: string;
  }): Promise<string[]> {
    const reactionType = sort === "mostLiked" ? "like" : "dislike";
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoin(
        "gif_reactions",
        "r",
        `r."gifId" = g.id AND r.type = :rt`,
        { rt: reactionType },
      )
      .select("g.id", "id")
      .where("g.status = :s", { s: "ready" })
      .groupBy("g.id")
      .orderBy("COUNT(r.id)", "DESC")
      .addOrderBy(`g."createdAt"`, "DESC")
      .limit(limit);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, q, tag);
    const rows: Array<{ id: string }> = await qb.getRawMany();
    return rows.map((r) => r.id);
  }

  private async loadByIds(ids: string[]): Promise<Gif[]> {
    if (ids.length === 0) return [];
    const items = await this.gifs.find({
      where: { id: In(ids) },
      relations: ["owner", "tags"],
    });
    const byId = new Map(items.map((g) => [g.id, g]));
    return ids
      .map((id) => byId.get(id))
      .filter((g): g is Gif => g !== undefined);
  }

  private async attachExtras(
    gifs: Gif[],
    viewerId: string | null | undefined,
  ) {
    if (gifs.length === 0) return [];
    const ids = gifs.map((g) => g.id);
    const [counts, viewerReactions] = await Promise.all([
      this.reactionsService.gifCountsFor(ids),
      viewerId
        ? this.reactionsService.viewerGifReactionsFor(ids, viewerId)
        : Promise.resolve(new Map<string, ReactionType>()),
    ]);

    return Promise.all(
      gifs.map(async (g) => {
        // The S3 object IS the gif itself — its proxy URL doubles as a
        // "thumbnail" for grid display.
        const url = g.status === "ready"
          ? await this.media.signUrl({ kind: "gif", id: g.id })
          : null;
        const c = counts.get(g.id) ?? { likes: 0, dislikes: 0 };
        return {
          id: g.id,
          title: g.title,
          description: g.description,
          sizeBytes: g.sizeBytes,
          durationSeconds: g.durationSeconds,
          status: g.status,
          visibility: g.visibility,
          source: g.source,
          createdAt: g.createdAt,
          owner: {
            id: g.owner.id,
            name: g.owner.name,
            username: g.owner.username,
            avatarUrl: g.owner.avatarUrl,
          },
          tags: g.tags.map((t) => ({ id: t.id, name: t.name })),
          gifUrl: url,
          thumbnailUrl: url,
          likeCount: c.likes,
          dislikeCount: c.dislikes,
          // Floor with reactions — every reactor saw it, so views can
          // never legitimately be lower. Catches old rows that predate
          // the viewCount column and reload-loops blocked by the
          // per-session client-side dedupe. Raw column stays in the DB.
          viewCount: Math.max(g.viewCount ?? 0, c.likes + c.dislikes),
          viewerReaction: viewerReactions.get(g.id) ?? null,
        };
      }),
    );
  }
}
