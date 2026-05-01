import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Notification } from "./notification.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { NotificationType } from "./notification.entity";
import { User } from "../users/user.entity";
import { PushService } from "../push/push.service";

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  createdAt: Date;
  readAt: Date | null;
  actor: { id: string; name: string; avatarUrl: string | null };
  subject:
    | { kind: "video"; id: string; title: string; thumbnailUrl: string | null }
    | { kind: "gif"; id: string; title: string; thumbnailUrl: string | null }
    | { kind: "user"; id: string; title: string; thumbnailUrl: string | null };
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
    private readonly media: MediaService,
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  private webOrigin(): string {
    return this.config.get<string>("WEB_ORIGIN") ?? "";
  }

  /**
   * Build an absolute URL for a push notification. The service worker
   * navigates to this on click, so it has to be an origin the SW can
   * resolve — relative is fine in production behind the same origin, but
   * the SW prefers absolute when WEB_ORIGIN is configured.
   */
  private link(path: string): string {
    const origin = this.webOrigin();
    if (!origin) return path;
    return path.startsWith("http") ? path : `${origin}${path}`;
  }

  private async actorName(actorId: string): Promise<string> {
    const u = await this.users.findOne({
      where: { id: actorId },
      select: { id: true, name: true },
    });
    return u?.name ?? "Someone";
  }

  /** Best-effort: log and swallow failures so a broken push doesn't break
   *  the underlying user action (like, subscribe, upload). */
  private firePush(
    userId: string,
    title: string,
    body: string,
    url: string,
    tag?: string,
  ): void {
    this.push
      .sendToUser(userId, { title, body, url, tag })
      .catch((err) =>
        this.logger.warn(
          `Push fan-out for ${userId} failed: ${(err as Error).message}`,
        ),
      );
  }

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
    const [actorName, video] = await Promise.all([
      this.actorName(ownerId),
      this.videos.findOne({
        where: { id: videoId },
        select: { id: true, title: true },
      }),
    ]);
    const url = this.link(`/videos/${videoId}`);
    const title = `${actorName} posted a new video`;
    const body = video?.title ?? "Tap to watch.";
    for (const recipientId of subscriberIds) {
      this.firePush(recipientId, title, body, url, `video_upload:${videoId}`);
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
    const [actorName, gif] = await Promise.all([
      this.actorName(ownerId),
      this.gifs.findOne({
        where: { id: gifId },
        select: { id: true, title: true },
      }),
    ]);
    const url = this.link(`/gifs/${gifId}`);
    const title = `${actorName} posted a new GIF`;
    const body = gif?.title ?? "Tap to view.";
    for (const recipientId of subscriberIds) {
      this.firePush(recipientId, title, body, url, `gif_upload:${gifId}`);
    }
  }

  /**
   * Called by SubscriptionsService.toggle whenever a NEW subscription is
   * created (not on unsubscribe). Records a notification for the target
   * and pushes a "X subscribed to you" alert. Self-subscriptions are
   * blocked upstream so we don't need to filter here.
   */
  async onSubscribed(subscriberId: string, targetUserId: string) {
    try {
      await this.notifications
        .createQueryBuilder()
        .insert()
        .values({
          recipientId: targetUserId,
          actorId: subscriberId,
          type: "subscribe",
        })
        .orIgnore()
        .execute();
    } catch (err) {
      this.logger.warn(
        `Failed to record subscribe notification: ${(err as Error).message}`,
      );
    }
    const actorName = await this.actorName(subscriberId);
    this.firePush(
      targetUserId,
      `${actorName} subscribed to you`,
      "You have a new subscriber on vids&gifs.",
      this.link("/notifications"),
      `subscribe:${subscriberId}`,
    );
  }

  /** Mirror of onSubscribed — called when the user unsubscribes so the
   *  matching notification disappears. Push isn't reversed (the recipient
   *  may have already seen it). */
  async onUnsubscribed(subscriberId: string, targetUserId: string) {
    await this.notifications
      .delete({
        actorId: subscriberId,
        recipientId: targetUserId,
        type: "subscribe",
      })
      .catch(() => {});
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
        select: { id: true, ownerId: true, title: true },
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
      const actorName = await this.actorName(actorId);
      this.firePush(
        video.ownerId,
        `${actorName} liked your video`,
        video.title,
        this.link(`/videos/${videoId}`),
        `video_like:${videoId}:${actorId}`,
      );
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
        select: { id: true, ownerId: true, title: true },
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
      const actorName = await this.actorName(actorId);
      this.firePush(
        gif.ownerId,
        `${actorName} liked your GIF`,
        gif.title,
        this.link(`/gifs/${gifId}`),
        `gif_like:${gifId}:${actorId}`,
      );
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
            Array<{ id: string; videoId: string }>
          >(
            `SELECT DISTINCT ON ("videoId") id, "videoId"
             FROM thumbnails
             WHERE "videoId" = ANY($1)
             ORDER BY "videoId", "createdAt" DESC`,
            [videoIds],
          )
        : Promise.resolve([]),
    ]);

    const videoById = new Map(videos.map((v) => [v.id, v]));
    const gifById = new Map(gifs.map((g) => [g.id, g]));
    const videoThumbId = new Map(videoThumbs.map((t) => [t.videoId, t.id]));

    return Promise.all(
      rows.map(async (n) => {
        let subject: NotificationListItem["subject"];
        if (n.type === "subscribe") {
          // No subject row in the DB — we synthesize one pointing at the
          // actor so the bell UI can still render a homogeneous list.
          subject = {
            kind: "user",
            id: n.actor.id,
            title: n.actor.name,
            thumbnailUrl: null,
          };
        } else if (n.videoId && videoById.has(n.videoId)) {
          const v = videoById.get(n.videoId)!;
          const thumbId = videoThumbId.get(v.id) ?? null;
          const thumbnailUrl = thumbId
            ? await this.media.signUrl({ kind: "thumbnail", id: thumbId })
            : null;
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
            ? await this.media.signUrl({ kind: "gif", id: g.id })
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
            avatarUrl: n.actor.avatarS3Key
              ? await this.media.signUrl({ kind: "avatar", id: n.actor.id })
              : (n.actor.avatarUrl ?? null),
          },
          subject,
        } as NotificationListItem;
      }),
    ).then((arr) => arr.filter((x): x is NotificationListItem => x !== null));
  }
}
