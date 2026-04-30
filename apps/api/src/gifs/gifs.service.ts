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
import type { VideoSort } from "@repo/shared";
import { Gif, GifVisibility } from "./gif.entity";
import { TagsService } from "../tags/tags.service";
import { S3Service } from "../s3/s3.service";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";

const MAX_GIF_BYTES = 20 * 1024 * 1024;

interface CreateUploadArgs {
  ownerId: string;
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
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (args.durationSeconds > 20.5) {
      throw new BadRequestException("GIF exceeds 20s duration limit");
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
      await this.s3.deleteObject(gif.s3Key);
      throw new BadRequestException("Uploaded gif exceeds 20 MB limit");
    }
    gif.sizeBytes = head.size;
    gif.status = "ready";
    await this.gifs.save(gif);
    return { ok: true };
  }

  async deleteGif(gifId: string, ownerId: string) {
    const gif = await this.gifs.findOne({ where: { id: gifId } });
    if (!gif) throw new NotFoundException("Gif not found");
    if (gif.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    if (gif.s3Key) {
      await this.s3.deleteObject(gif.s3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete gif S3 object ${gif.s3Key}: ${(err as Error).message}`,
        );
      });
    }
    await this.gifs.delete({ id: gifId });
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

  async byId(id: string, viewerId?: string | null) {
    const g = await this.gifs.findOne({
      where: { id },
      relations: ["owner", "tags"],
    });
    if (!g) throw new NotFoundException("Gif not found");
    if (g.visibility === "private" && g.ownerId !== viewerId) {
      throw new NotFoundException("Gif not found");
    }
    const [enriched] = await this.attachExtras([g], viewerId);
    const gifUrl = g.status === "ready" ? await this.s3.presignGet(g.s3Key) : null;
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
        // The S3 object IS the gif itself — its presigned GET URL doubles
        // as a "thumbnail" for grid display.
        const url = g.status === "ready"
          ? await this.s3.presignGet(g.s3Key)
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
          createdAt: g.createdAt,
          owner: {
            id: g.owner.id,
            name: g.owner.name,
            avatarUrl: g.owner.avatarUrl,
          },
          tags: g.tags.map((t) => ({ id: t.id, name: t.name })),
          gifUrl: url,
          thumbnailUrl: url,
          likeCount: c.likes,
          dislikeCount: c.dislikes,
          viewerReaction: viewerReactions.get(g.id) ?? null,
        };
      }),
    );
  }
}
