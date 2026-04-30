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
import { MAX_VIDEO_BYTES, type VideoSort } from "@repo/shared";
import { Video, VideoVisibility } from "./video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { TagsService } from "../tags/tags.service";
import { S3Service } from "../s3/s3.service";
import { TranscoderService } from "../transcoder/transcoder.service";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { FavoritesService } from "../favorites/favorites.service";

interface CreateUploadArgs {
  ownerId: string;
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  tagNames: string[];
  visibility: VideoVisibility;
}

interface FinalizeArgs {
  videoId: string;
  ownerId: string;
  compressServerSide: boolean;
}

const extensionForMime = (mime: string): string => {
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  if (mime === "video/x-matroska") return "mkv";
  return "bin";
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video";

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Thumbnail)
    private readonly thumbnails: Repository<Thumbnail>,
    private readonly tagsService: TagsService,
    private readonly s3: S3Service,
    private readonly transcoder: TranscoderService,
    private readonly reactionsService: ReactionsService,
    private readonly favoritesService: FavoritesService,
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_VIDEO_BYTES) {
      throw new BadRequestException("File exceeds 1.5 GiB limit");
    }

    // One in-flight upload per user. A draft is considered abandoned once the
    // presigned PUT TTL has expired, so older "uploading" rows don't block.
    const STALE_AFTER_MS = 30 * 60 * 1000;
    const inFlight = await this.videos.findOne({
      where: { ownerId: args.ownerId, status: "uploading" },
      order: { createdAt: "DESC" },
    });
    if (inFlight && Date.now() - inFlight.createdAt.getTime() < STALE_AFTER_MS) {
      throw new ConflictException("You already have an upload in progress");
    }

    const tags = await this.tagsService.ensureTags(args.tagNames);

    const ext = extensionForMime(args.mimeType);
    const slug = slugify(args.title);

    const draft = this.videos.create({
      ownerId: args.ownerId,
      title: args.title,
      description: args.description,
      s3Key: "",
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      status: "uploading",
      visibility: args.visibility,
      tags,
    });
    const saved = await this.videos.save(draft);

    const s3Key = `videos/${saved.id}/source-${slug}.${ext}`;
    await this.videos.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;

    const uploadUrl = await this.s3.presignPut(s3Key, args.mimeType);

    return {
      videoId: saved.id,
      s3Key,
      uploadUrl,
    };
  }

  async finalizeUpload(args: FinalizeArgs) {
    const video = await this.videos.findOne({ where: { id: args.videoId } });
    if (!video) throw new NotFoundException("Video not found");
    if (video.ownerId !== args.ownerId) {
      throw new BadRequestException("Not the owner");
    }

    const head = await this.s3.headObject(video.s3Key);
    if (!head) {
      throw new BadRequestException("Video object not found in S3");
    }
    if (head.size > MAX_VIDEO_BYTES) {
      await this.s3.deleteObject(video.s3Key);
      throw new BadRequestException("Uploaded file exceeds 1.5 GiB limit");
    }

    video.sizeBytes = head.size;

    // Server-side fallback: if the client couldn't transcode, re-encode the
    // uploaded source on our end before marking the video ready.
    if (args.compressServerSide) {
      const sourceKey = video.s3Key;
      try {
        const compressed = await this.transcoder.compressTo480p(sourceKey);
        video.s3Key = compressed.key;
        video.mimeType = compressed.mimeType;
        video.sizeBytes = compressed.sizeBytes;
        if (compressed.key !== sourceKey) {
          await this.s3.deleteObject(sourceKey).catch((err) => {
            this.logger.warn(
              `Failed to delete source object ${sourceKey}: ${(err as Error).message}`,
            );
          });
        }
      } catch (err) {
        this.logger.error(
          `Server-side compression failed for video ${video.id}; keeping original: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }

    video.status = "ready";
    await this.videos.save(video);

    try {
      const thumb = await this.transcoder.generateThumbnail(video.id);
      if (!thumb) {
        this.logger.warn(
          `Thumbnail generation skipped for video ${video.id} (ffmpeg unavailable)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Thumbnail generation failed for video ${video.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { ok: true };
  }

  async deleteVideo(videoId: string, ownerId: string) {
    const video = await this.videos.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException("Video not found");
    if (video.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }

    const thumbs = await this.thumbnails.find({ where: { videoId } });

    const s3Keys = [
      ...(video.s3Key ? [video.s3Key] : []),
      ...thumbs.map((t) => t.s3Key),
    ];
    await Promise.all(
      s3Keys.map(async (key) => {
        try {
          await this.s3.deleteObject(key);
        } catch (err) {
          this.logger.warn(
            `Failed to delete S3 object ${key}: ${(err as Error).message}`,
          );
        }
      }),
    );

    // Cascades remove thumbnails and video_tags rows; tags themselves stay.
    await this.videos.delete({ id: videoId });

    return { ok: true };
  }

  countByOwner(ownerId: string): Promise<number> {
    return this.videos.count({ where: { ownerId, status: "ready" } });
  }

  /**
   * Lightweight projection of every public ready video's id and last-modified
   * timestamp. Used to build the SEO sitemap; does not include private videos
   * regardless of viewer.
   */
  async listPublicForSitemap(): Promise<
    Array<{ id: string; createdAt: Date }>
  > {
    return this.videos.find({
      select: { id: true, createdAt: true },
      where: { status: "ready", visibility: "public" },
      order: { createdAt: "DESC" },
      take: 5000,
    });
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

    const qb = this.videos
      .createQueryBuilder("v")
      .leftJoinAndSelect("v.owner", "owner")
      .leftJoinAndSelect("v.tags", "tags")
      .where("v.status = :s", { s: "ready" })
      .orderBy("v.createdAt", "DESC")
      .addOrderBy("v.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);

    if (cursor) {
      const c = await this.videos.findOne({ where: { id: cursor } });
      if (c) {
        qb.andWhere("v.createdAt < :cAt", { cAt: c.createdAt });
      }
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
    cursor,
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

    const qb = this.videos
      .createQueryBuilder("v")
      .leftJoinAndSelect("v.owner", "owner")
      .leftJoinAndSelect("v.tags", "tags")
      .where("v.status = :s", { s: "ready" })
      .orderBy("v.createdAt", "DESC")
      .addOrderBy("v.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, trimmedQ, trimmedTag);

    if (cursor) {
      const c = await this.videos.findOne({ where: { id: cursor } });
      if (c) {
        qb.andWhere("v.createdAt < :cAt", { cAt: c.createdAt });
      }
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

  private applyVisibility(
    qb: SelectQueryBuilder<Video>,
    viewerId: string | null | undefined,
  ) {
    if (viewerId) {
      qb.andWhere("(v.visibility = :pub OR v.ownerId = :viewerId)", {
        pub: "public",
        viewerId,
      });
    } else {
      qb.andWhere("v.visibility = :pub", { pub: "public" });
    }
  }

  private applySearchFilters(
    qb: SelectQueryBuilder<Video>,
    q: string,
    tag: string,
  ) {
    if (tag) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM video_tags vt
           JOIN tags t ON t.id = vt."tagId"
           WHERE vt."videoId" = v.id AND t.name = :tagName
         )`,
        { tagName: tag.toLowerCase() },
      );
    }
    if (q) {
      const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        `(v.title ILIKE :qLike OR EXISTS (
           SELECT 1 FROM video_tags vt
           JOIN tags t ON t.id = vt."tagId"
           WHERE vt."videoId" = v.id AND t.name ILIKE :qLike
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

    const qb = this.videos
      .createQueryBuilder("v")
      .leftJoin(
        "video_reactions",
        "r",
        `r."videoId" = v.id AND r.type = :rt`,
        { rt: reactionType },
      )
      .select("v.id", "id")
      .where("v.status = :s", { s: "ready" })
      .groupBy("v.id")
      .orderBy("COUNT(r.id)", "DESC")
      .addOrderBy(`v."createdAt"`, "DESC")
      .limit(limit);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, q, tag);

    const rows: Array<{ id: string }> = await qb.getRawMany();
    return rows.map((r) => r.id);
  }

  private async loadByIds(ids: string[]): Promise<Video[]> {
    if (ids.length === 0) return [];
    const items = await this.videos.find({
      where: { id: In(ids) },
      relations: ["owner", "tags"],
    });
    const byId = new Map(items.map((v) => [v.id, v]));
    return ids
      .map((id) => byId.get(id))
      .filter((v): v is Video => v !== undefined);
  }

  async byId(id: string, viewerId?: string | null) {
    const v = await this.videos.findOne({
      where: { id },
      relations: ["owner", "tags"],
    });
    if (!v) throw new NotFoundException("Video not found");
    if (v.visibility === "private" && v.ownerId !== viewerId) {
      throw new NotFoundException("Video not found");
    }

    const [enriched] = await this.attachExtras([v], viewerId);
    const videoUrl =
      v.status === "ready" ? await this.s3.presignGet(v.s3Key) : null;

    return { ...enriched, videoUrl };
  }

  async suggested(id: string, limit: number, viewerId?: string | null) {
    const v = await this.videos.findOne({
      where: { id },
      relations: ["tags"],
    });
    if (!v) throw new NotFoundException("Video not found");
    if (v.visibility === "private" && v.ownerId !== viewerId) {
      throw new NotFoundException("Video not found");
    }
    const tagIds = v.tags.map((t) => t.id);
    if (tagIds.length === 0) return [];

    const qb = this.videos
      .createQueryBuilder("v")
      .innerJoin("video_tags", "vt", "vt.videoId = v.id")
      .leftJoinAndSelect("v.owner", "owner")
      .leftJoinAndSelect("v.tags", "tags")
      .where("vt.tagId IN (:...tagIds)", { tagIds })
      .andWhere("v.id != :id", { id })
      .andWhere("v.status = :s", { s: "ready" });

    if (viewerId) {
      qb.andWhere("(v.visibility = :pub OR v.ownerId = :viewerId)", {
        pub: "public",
        viewerId,
      });
    } else {
      qb.andWhere("v.visibility = :pub", { pub: "public" });
    }

    const rows = await qb
      .groupBy("v.id")
      .addGroupBy("owner.id")
      .addGroupBy("tags.id")
      .addSelect("COUNT(vt.tagId)", "shared")
      .orderBy("shared", "DESC")
      .addOrderBy("v.createdAt", "DESC")
      .limit(limit)
      .getMany();

    return this.attachExtras(rows, viewerId);
  }

  private async attachExtras(
    videos: Video[],
    viewerId: string | null | undefined,
  ) {
    if (videos.length === 0) return [];
    const ids = videos.map((v) => v.id);

    const [thumbRows, counts, viewerReactions, favoritedSet] =
      await Promise.all([
        this.thumbnails.manager.query<
          Array<{ videoId: string; s3Key: string }>
        >(
          `SELECT DISTINCT ON ("videoId") "videoId", "s3Key"
         FROM thumbnails
         WHERE "videoId" = ANY($1)
         ORDER BY "videoId", "createdAt" DESC`,
          [ids],
        ),
        this.reactionsService.countsFor(ids),
        viewerId
          ? this.reactionsService.viewerReactionsFor(ids, viewerId)
          : Promise.resolve(new Map<string, ReactionType>()),
        viewerId
          ? this.favoritesService.favoritedSet(ids, viewerId)
          : Promise.resolve(new Set<string>()),
      ]);
    const keyByVideo = new Map(thumbRows.map((r) => [r.videoId, r.s3Key]));

    return Promise.all(
      videos.map(async (v) => {
        const key = keyByVideo.get(v.id) ?? null;
        const [thumbnailUrl, videoUrl] = await Promise.all([
          key ? this.s3.presignGet(key) : Promise.resolve(null),
          v.status === "ready" && v.s3Key
            ? this.s3.presignGet(v.s3Key)
            : Promise.resolve(null),
        ]);
        const c = counts.get(v.id) ?? { likes: 0, dislikes: 0 };
        return {
          id: v.id,
          title: v.title,
          description: v.description,
          mimeType: v.mimeType,
          sizeBytes: v.sizeBytes,
          status: v.status,
          visibility: v.visibility,
          createdAt: v.createdAt,
          owner: {
            id: v.owner.id,
            name: v.owner.name,
            avatarUrl: v.owner.avatarUrl,
          },
          tags: v.tags.map((t) => ({ id: t.id, name: t.name })),
          thumbnailUrl,
          videoUrl,
          likeCount: c.likes,
          dislikeCount: c.dislikes,
          viewerReaction: viewerReactions.get(v.id) ?? null,
          viewerFavorited: favoritedSet.has(v.id),
        };
      }),
    );
  }

  async listFavorites({
    userId,
    cursor,
    limit,
  }: {
    userId: string;
    cursor?: string;
    limit: number;
  }) {
    // Step 1: paginate the favorites join table by favorite-creation time.
    const favRows = await this.videos.manager.query<
      Array<{ videoId: string; createdAt: Date }>
    >(
      cursor
        ? `SELECT f."videoId" AS "videoId", f."createdAt" AS "createdAt"
           FROM video_favorites f
           WHERE f."userId" = $1
             AND f."createdAt" < (
               SELECT "createdAt" FROM video_favorites
               WHERE "userId" = $1 AND "videoId" = $2
               LIMIT 1
             )
           ORDER BY f."createdAt" DESC
           LIMIT $3`
        : `SELECT f."videoId" AS "videoId", f."createdAt" AS "createdAt"
           FROM video_favorites f
           WHERE f."userId" = $1
           ORDER BY f."createdAt" DESC
           LIMIT $2`,
      cursor ? [userId, cursor, limit + 1] : [userId, limit + 1],
    );

    const hasMore = favRows.length > limit;
    const sliced = hasMore ? favRows.slice(0, limit) : favRows;
    const ids = sliced.map((r) => r.videoId);

    if (ids.length === 0) {
      return { items: [], nextCursor: null };
    }

    // Step 2: fetch the actual videos (visible to this viewer) with relations.
    const rows = await this.videos.find({
      where: { id: In(ids) },
      relations: ["owner", "tags"],
    });
    const visible = rows.filter(
      (v) =>
        v.status === "ready" &&
        (v.visibility === "public" || v.ownerId === userId),
    );

    // Preserve favorited-DESC order from step 1.
    const order = new Map(ids.map((id, i) => [id, i]));
    visible.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );

    const nextCursor =
      hasMore && sliced.length > 0
        ? sliced[sliced.length - 1].videoId
        : null;
    return {
      items: await this.attachExtras(visible, userId),
      nextCursor,
    };
  }
}
