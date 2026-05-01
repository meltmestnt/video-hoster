import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, MoreThanOrEqual, Repository, SelectQueryBuilder } from "typeorm";
import {
  DAILY_VIDEO_BYTES_LIMIT,
  DAILY_VIDEO_BYTES_LIMIT_GB,
  DAILY_VIDEO_UPLOAD_LIMIT,
  MAX_VIDEO_BYTES,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_VIDEO_LIMIT,
  type VideoSort,
} from "@repo/shared";
import { Video, VideoDownloadPolicy, VideoVisibility } from "./video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { User } from "../users/user.entity";
import { TagsService } from "../tags/tags.service";
import { S3Service } from "../s3/s3.service";
import { TranscoderService } from "../transcoder/transcoder.service";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { FavoritesService } from "../favorites/favorites.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AudioService } from "../audio/audio.service";
import { MailService } from "../mail/mail.service";
import { MediaService } from "../media/media.service";

interface CreateUploadArgs {
  ownerId: string;
  ownerStatus: User["status"];
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  tagNames: string[];
  visibility: VideoVisibility;
  downloadPolicy: VideoDownloadPolicy;
}

interface FinalizeArgs {
  videoId: string;
  ownerId: string;
  compressServerSide: boolean;
  thumbnailS3Key?: string;
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
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tagsService: TagsService,
    private readonly s3: S3Service,
    private readonly transcoder: TranscoderService,
    private readonly reactionsService: ReactionsService,
    private readonly favoritesService: FavoritesService,
    private readonly notificationsService: NotificationsService,
    private readonly audioService: AudioService,
    private readonly mailService: MailService,
    private readonly media: MediaService,
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_VIDEO_BYTES) {
      throw new BadRequestException("File exceeds 1.5 GiB limit");
    }

    // Unverified accounts get a tiny preview quota — one of each kind.
    // The error message carries a stable prefix so the client can detect
    // it and pop a "verify your email" dialog instead of a generic toast.
    if (args.ownerStatus !== "verified") {
      const existing = await this.videos.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_VIDEO_LIMIT) {
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}video`,
        );
      }
    }

    // Per-user daily quota. Rolling 24-hour window is fairer than a calendar
    // day and avoids timezone edge cases. Drafts count too, so a user can't
    // sidestep the limit by spamming createUpload without finalizing.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.videos.find({
      where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      select: ["id", "sizeBytes"],
    });
    if (recent.length >= DAILY_VIDEO_UPLOAD_LIMIT) {
      throw new BadRequestException(
        `Daily upload limit reached (${DAILY_VIDEO_UPLOAD_LIMIT} videos in 24h). Try again later.`,
      );
    }
    const usedBytes = recent.reduce(
      (sum, v) => sum + Number(v.sizeBytes ?? 0),
      0,
    );
    if (usedBytes + args.sizeBytes > DAILY_VIDEO_BYTES_LIMIT) {
      const remainingMb = Math.max(
        0,
        Math.floor((DAILY_VIDEO_BYTES_LIMIT - usedBytes) / 1024 / 1024),
      );
      throw new BadRequestException(
        `Daily upload size limit reached (${DAILY_VIDEO_BYTES_LIMIT_GB} GB in 24h). Only ${remainingMb} MB left in your window.`,
      );
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
      downloadPolicy: args.downloadPolicy,
      tags,
    });
    const saved = await this.videos.save(draft);

    const s3Key = `videos/${saved.id}/source-${slug}.${ext}`;
    await this.videos.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;

    const thumbnailS3Key = `videos/${saved.id}/thumb-${Date.now()}.jpg`;

    const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
      this.s3.presignPut(s3Key, args.mimeType),
      this.s3.presignPut(thumbnailS3Key, "image/jpeg"),
    ]);

    return {
      videoId: saved.id,
      s3Key,
      uploadUrl,
      thumbnailS3Key,
      thumbnailUploadUrl,
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

    // Fire-and-forget admin alert. Looking up the owner here keeps the
    // common path simple; failing the email must never fail the upload.
    this.users
      .findOne({ where: { id: video.ownerId } })
      .then((owner) => {
        if (!owner) return;
        return this.mailService.notifyAdminsOfVideoUpload({
          user: { name: owner.name, email: owner.email },
          video: {
            id: video.id,
            title: video.title,
            visibility: video.visibility,
          },
        });
      })
      .catch((err) =>
        this.logger.warn(
          `Failed to notify admins of upload ${video.id}: ${(err as Error).message}`,
        ),
      );

    // Fan out "uploaded a new video" notifications to subscribers. Done before
    // the thumbnail step so the notification lands even if thumbnail
    // generation throws.
    if (video.visibility === "public") {
      await this.notificationsService
        .onVideoUploaded(video.id, video.ownerId)
        .catch((err) =>
          this.logger.warn(
            `Failed to notify subscribers of upload ${video.id}: ${(err as Error).message}`,
          ),
        );
    }

    if (args.thumbnailS3Key) {
      const expectedPrefix = `videos/${video.id}/thumb-`;
      if (!args.thumbnailS3Key.startsWith(expectedPrefix)) {
        this.logger.warn(
          `Rejecting thumbnail key ${args.thumbnailS3Key} — does not match video ${video.id}`,
        );
      } else {
        const head = await this.s3.headObject(args.thumbnailS3Key);
        if (head) {
          const row = this.thumbnails.create({
            videoId: video.id,
            s3Key: args.thumbnailS3Key,
          });
          await this.thumbnails.save(row);
          return { ok: true };
        }
        this.logger.warn(
          `Client-supplied thumbnail ${args.thumbnailS3Key} not found in S3; falling back`,
        );
      }
    }

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

  async getUploadQuota(ownerId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.videos.find({
      where: { ownerId, createdAt: MoreThanOrEqual(since) },
      select: ["id", "sizeBytes"],
    });
    const usedBytes = recent.reduce(
      (sum, v) => sum + Number(v.sizeBytes ?? 0),
      0,
    );
    return {
      count: recent.length,
      usedBytes,
      videoLimit: DAILY_VIDEO_UPLOAD_LIMIT,
      bytesLimit: DAILY_VIDEO_BYTES_LIMIT,
    };
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
      v.status === "ready"
        ? await this.media.signUrl({ kind: "video", id: v.id })
        : null;

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

    const [thumbRows, counts, viewerReactions, favoritedSet, audioByVideo] =
      await Promise.all([
        this.thumbnails.manager.query<
          Array<{ id: string; videoId: string }>
        >(
          `SELECT DISTINCT ON ("videoId") id, "videoId"
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
        this.audioService.tracksForVideos(ids),
      ]);
    const thumbIdByVideo = new Map(thumbRows.map((r) => [r.videoId, r.id]));

    return Promise.all(
      videos.map(async (v) => {
        const thumbId = thumbIdByVideo.get(v.id) ?? null;
        const [thumbnailUrl, videoUrl] = await Promise.all([
          thumbId
            ? this.media.signUrl({ kind: "thumbnail", id: thumbId })
            : Promise.resolve(null),
          v.status === "ready" && v.s3Key
            ? this.media.signUrl({ kind: "video", id: v.id })
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
          downloadPolicy: v.downloadPolicy,
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
          mainAudioMuted: v.mainAudioMuted,
          audioTracks: audioByVideo.get(v.id) ?? [],
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
