import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Notification } from "./notification.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { S3Service } from "../s3/s3.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { NotificationType } from "./notification.entity";
import { User } from "../users/user.entity";

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  createdAt: Date;
  readAt: Date | null;
  actor: { id: string; name: string; avatarUrl: string | null };
  subject:
    | { kind: "video"; id: string; title: string; thumbnailUrl: string | null }
    | { kind: "gif"; id: string; title: string; thumbnailUrl: string | null };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Gif) private readonly gifs: Repository<Gif>,
    @InjectRepository(Thumbnail)
    private readonly thumbnails: Repository<Thumbnail>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly s3: S3Service,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // Owner can disable upload-fanout from their profile. Treated as a hard
  // gate — both video and gif fanouts skip when this is false.
  private async ownerWantsFanout(ownerId: string): Promise<boolean> {
    const owner = await this.users.findOne({
      where: { id: ownerId },
      select: { id: true, notifySubscribersOnUpload: true },
    });
    return !!owner?.notifySubscribersOnUpload;
  }

  /**
   * Fan out a "{owner} uploaded a new video" notification to every subscriber.
   * The owner is the actor; each subscriber is a recipient. Self-uploads can't
   * generate a notification because subscribe-to-self is blocked.
   */
  async onVideoUploaded(videoId: string, ownerId: string) {
    if (!(await this.ownerWantsFanout(ownerId))) return;
    const subscriberIds = await this.subscriptions.subscriberIdsOf(ownerId);
    if (subscriberIds.length === 0) return;
    const rows = subscriberIds.map((recipientId) => ({
      recipientId,
      actorId: ownerId,
      type: "video_upload" as NotificationType,
      videoId,
    }));
    try {
      await this.notifications
        .createQueryBuilder()
        .insert()
        .values(rows)
        .orIgnore()
        .execute();
    } catch (err) {
      this.logger.warn(
        `Failed to fan out video_upload notifications: ${(err as Error).message}`,
      );
    }
  }

  async onGifUploaded(gifId: string, ownerId: string) {
    if (!(await this.ownerWantsFanout(ownerId))) return;
    const subscriberIds = await this.subscriptions.subscriberIdsOf(ownerId);
    if (subscriberIds.length === 0) return;
    const rows = subscriberIds.map((recipientId) => ({
      recipientId,
      actorId: ownerId,
      type: "gif_upload" as NotificationType,
      gifId,
    }));
    try {
      await this.notifications
        .createQueryBuilder()
        .insert()
        .values(rows)
        .orIgnore()
        .execute();
    } catch (err) {
      this.logger.warn(
        `Failed to fan out gif_upload notifications: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Apply the notification side-effects of a video reaction transition. We
   * only notify on `like`; switching to dislike or toggling off removes the
   * existing like notification so the recipient doesn't see stale entries.
   */
  async onVideoReaction(
    videoId: string,
    actorId: string,
    next: ReactionType | null,
  ) {
    if (next === "like") {
      const video = await this.videos.findOne({
        where: { id: videoId },
        select: { id: true, ownerId: true },
      });
      if (!video || video.ownerId === actorId) return;
      try {
        await this.notifications
          .createQueryBuilder()
          .insert()
          .values({
            recipientId: video.ownerId,
            actorId,
            type: "video_like",
            videoId,
          })
          .orIgnore()
          .execute();
      } catch (err) {
        this.logger.warn(
          `Failed to record video_like notification: ${(err as Error).message}`,
        );
      }
      return;
    }
    await this.notifications
      .delete({ videoId, actorId, type: "video_like" })
      .catch(() => {});
  }

  async onGifReaction(
    gifId: string,
    actorId: string,
    next: ReactionType | null,
  ) {
    if (next === "like") {
      const gif = await this.gifs.findOne({
        where: { id: gifId },
        select: { id: true, ownerId: true },
      });
      if (!gif || gif.ownerId === actorId) return;
      try {
        await this.notifications
          .createQueryBuilder()
          .insert()
          .values({
            recipientId: gif.ownerId,
            actorId,
            type: "gif_like",
            gifId,
          })
          .orIgnore()
          .execute();
      } catch (err) {
        this.logger.warn(
          `Failed to record gif_like notification: ${(err as Error).message}`,
        );
      }
      return;
    }
    await this.notifications
      .delete({ gifId, actorId, type: "gif_like" })
      .catch(() => {});
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.count({
      where: { recipientId: userId, readAt: IsNull() },
    });
  }

  async list(
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: NotificationListItem[]; nextCursor: string | null }> {
    const qb = this.notifications
      .createQueryBuilder("n")
      .leftJoinAndSelect("n.actor", "actor")
      .where("n.recipientId = :userId", { userId })
      .orderBy("n.createdAt", "DESC")
      .addOrderBy("n.id", "DESC")
      .take(limit + 1);

    if (cursor) {
      const c = await this.notifications.findOne({
        where: { id: cursor, recipientId: userId },
      });
      if (c) qb.andWhere("n.createdAt < :cAt", { cAt: c.createdAt });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.attachSubjects(sliced);
    const nextCursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;
    return { items, nextCursor };
  }

  async markRead(id: string, userId: string) {
    await this.notifications.update(
      { id, recipientId: userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.notifications.update(
      { recipientId: userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { ok: true };
  }

  private async attachSubjects(
    rows: Notification[],
  ): Promise<NotificationListItem[]> {
    if (rows.length === 0) return [];

    const videoIds = Array.from(
      new Set(rows.map((r) => r.videoId).filter((v): v is string => !!v)),
    );
    const gifIds = Array.from(
      new Set(rows.map((r) => r.gifId).filter((v): v is string => !!v)),
    );

    const [videos, gifs, videoThumbs] = await Promise.all([
      videoIds.length
        ? this.videos.find({
            where: { id: In(videoIds) },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      gifIds.length
        ? this.gifs.find({
            where: { id: In(gifIds) },
            select: { id: true, title: true, s3Key: true },
          })
        : Promise.resolve([]),
      videoIds.length
        ? this.thumbnails.manager.query<
            Array<{ videoId: string; s3Key: string }>
          >(
            `SELECT DISTINCT ON ("videoId") "videoId", "s3Key"
             FROM thumbnails
             WHERE "videoId" = ANY($1)
             ORDER BY "videoId", "createdAt" DESC`,
            [videoIds],
          )
        : Promise.resolve([]),
    ]);

    const videoById = new Map(videos.map((v) => [v.id, v]));
    const gifById = new Map(gifs.map((g) => [g.id, g]));
    const videoThumbKey = new Map(videoThumbs.map((t) => [t.videoId, t.s3Key]));

    return Promise.all(
      rows.map(async (n) => {
        let subject: NotificationListItem["subject"];
        if (n.videoId && videoById.has(n.videoId)) {
          const v = videoById.get(n.videoId)!;
          const key = videoThumbKey.get(v.id) ?? null;
          const thumbnailUrl = key ? await this.s3.presignGet(key) : null;
          subject = {
            kind: "video",
            id: v.id,
            title: v.title,
            thumbnailUrl,
          };
        } else if (n.gifId && gifById.has(n.gifId)) {
          const g = gifById.get(n.gifId)!;
          // The GIF object itself is also its thumbnail.
          const thumbnailUrl = g.s3Key
            ? await this.s3.presignGet(g.s3Key)
            : null;
          subject = {
            kind: "gif",
            id: g.id,
            title: g.title,
            thumbnailUrl,
          };
        } else {
          // Subject was deleted but the notification row still exists for a
          // moment before its CASCADE fires. Skip it on the wire.
          return null;
        }
        return {
          id: n.id,
          type: n.type,
          createdAt: n.createdAt,
          readAt: n.readAt,
          actor: {
            id: n.actor.id,
            name: n.actor.name,
            avatarUrl: n.actor.avatarUrl,
          },
          subject,
        } as NotificationListItem;
      }),
    ).then((arr) => arr.filter((x): x is NotificationListItem => x !== null));
  }
}
