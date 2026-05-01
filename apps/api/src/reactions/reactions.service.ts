import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ReactionType, VideoReaction } from "./reaction.entity";
import { CommentReaction } from "./comment-reaction.entity";
import { GifReaction } from "./gif-reaction.entity";
import { NotificationsService } from "../notifications/notifications.service";

export interface VideoReactionCounts {
  likes: number;
  dislikes: number;
}

@Injectable()
export class ReactionsService {
  private readonly logger = new Logger(ReactionsService.name);

  constructor(
    @InjectRepository(VideoReaction)
    private readonly reactions: Repository<VideoReaction>,
    @InjectRepository(CommentReaction)
    private readonly commentReactions: Repository<CommentReaction>,
    @InjectRepository(GifReaction)
    private readonly gifReactions: Repository<GifReaction>,
    private readonly notifications: NotificationsService,
  ) {}

  async setReaction(videoId: string, userId: string, type: ReactionType) {
    const existing = await this.reactions.findOne({
      where: { videoId, userId },
    });
    const prevType = existing?.type ?? null;
    let next: ReactionType | null;
    if (existing) {
      if (existing.type === type) {
        await this.reactions.delete({ id: existing.id });
        next = null;
      } else {
        existing.type = type;
        await this.reactions.save(existing);
        next = type;
      }
    } else {
      await this.reactions.save(
        this.reactions.create({ videoId, userId, type }),
      );
      next = type;
    }
    this.logger.log(
      `reactions.setReaction kind=video userId=${userId} targetId=${videoId} type=${next ?? "null"} prevType=${prevType ?? "null"}`,
    );
    await this.notifications.onVideoReaction(videoId, userId, next);
    return { reaction: next };
  }

  async countsFor(
    videoIds: string[],
  ): Promise<Map<string, VideoReactionCounts>> {
    const map = new Map<string, VideoReactionCounts>();
    if (videoIds.length === 0) return map;
    for (const id of videoIds) map.set(id, { likes: 0, dislikes: 0 });

    const rows: Array<{ videoId: string; type: string; count: string }> =
      await this.reactions
        .createQueryBuilder("r")
        .select("r.videoId", "videoId")
        .addSelect("r.type", "type")
        .addSelect("COUNT(*)", "count")
        .where("r.videoId IN (:...ids)", { ids: videoIds })
        .groupBy("r.videoId")
        .addGroupBy("r.type")
        .getRawMany();

    for (const row of rows) {
      const entry = map.get(row.videoId);
      if (!entry) continue;
      const n = Number(row.count);
      if (row.type === "like") entry.likes = n;
      else if (row.type === "dislike") entry.dislikes = n;
    }
    return map;
  }

  async viewerReactionsFor(
    videoIds: string[],
    userId: string,
  ): Promise<Map<string, ReactionType>> {
    if (videoIds.length === 0) return new Map();
    const rows = await this.reactions.find({
      where: { userId, videoId: In(videoIds) },
    });
    return new Map(rows.map((r) => [r.videoId, r.type]));
  }

  async setCommentReaction(
    commentId: string,
    userId: string,
    type: ReactionType,
  ) {
    const existing = await this.commentReactions.findOne({
      where: { commentId, userId },
    });
    const prevType = existing?.type ?? null;
    let next: ReactionType | null;
    if (existing) {
      if (existing.type === type) {
        await this.commentReactions.delete({ id: existing.id });
        next = null;
      } else {
        existing.type = type;
        await this.commentReactions.save(existing);
        next = type;
      }
    } else {
      await this.commentReactions.save(
        this.commentReactions.create({ commentId, userId, type }),
      );
      next = type;
    }
    this.logger.log(
      `reactions.setReaction kind=comment userId=${userId} targetId=${commentId} type=${next ?? "null"} prevType=${prevType ?? "null"}`,
    );
    return { reaction: next };
  }

  async commentCountsFor(
    commentIds: string[],
  ): Promise<Map<string, VideoReactionCounts>> {
    const map = new Map<string, VideoReactionCounts>();
    if (commentIds.length === 0) return map;
    for (const id of commentIds) map.set(id, { likes: 0, dislikes: 0 });

    const rows: Array<{ commentId: string; type: string; count: string }> =
      await this.commentReactions
        .createQueryBuilder("r")
        .select("r.commentId", "commentId")
        .addSelect("r.type", "type")
        .addSelect("COUNT(*)", "count")
        .where("r.commentId IN (:...ids)", { ids: commentIds })
        .groupBy("r.commentId")
        .addGroupBy("r.type")
        .getRawMany();

    for (const row of rows) {
      const entry = map.get(row.commentId);
      if (!entry) continue;
      const n = Number(row.count);
      if (row.type === "like") entry.likes = n;
      else if (row.type === "dislike") entry.dislikes = n;
    }
    return map;
  }

  async viewerCommentReactionsFor(
    commentIds: string[],
    userId: string,
  ): Promise<Map<string, ReactionType>> {
    if (commentIds.length === 0) return new Map();
    const rows = await this.commentReactions.find({
      where: { userId, commentId: In(commentIds) },
    });
    return new Map(rows.map((r) => [r.commentId, r.type]));
  }

  async setGifReaction(gifId: string, userId: string, type: ReactionType) {
    const existing = await this.gifReactions.findOne({
      where: { gifId, userId },
    });
    const prevType = existing?.type ?? null;
    let next: ReactionType | null;
    if (existing) {
      if (existing.type === type) {
        await this.gifReactions.delete({ id: existing.id });
        next = null;
      } else {
        existing.type = type;
        await this.gifReactions.save(existing);
        next = type;
      }
    } else {
      await this.gifReactions.save(
        this.gifReactions.create({ gifId, userId, type }),
      );
      next = type;
    }
    this.logger.log(
      `reactions.setReaction kind=gif userId=${userId} targetId=${gifId} type=${next ?? "null"} prevType=${prevType ?? "null"}`,
    );
    await this.notifications.onGifReaction(gifId, userId, next);
    return { reaction: next };
  }

  async gifCountsFor(
    gifIds: string[],
  ): Promise<Map<string, VideoReactionCounts>> {
    const map = new Map<string, VideoReactionCounts>();
    if (gifIds.length === 0) return map;
    for (const id of gifIds) map.set(id, { likes: 0, dislikes: 0 });

    const rows: Array<{ gifId: string; type: string; count: string }> =
      await this.gifReactions
        .createQueryBuilder("r")
        .select("r.gifId", "gifId")
        .addSelect("r.type", "type")
        .addSelect("COUNT(*)", "count")
        .where("r.gifId IN (:...ids)", { ids: gifIds })
        .groupBy("r.gifId")
        .addGroupBy("r.type")
        .getRawMany();

    for (const row of rows) {
      const entry = map.get(row.gifId);
      if (!entry) continue;
      const n = Number(row.count);
      if (row.type === "like") entry.likes = n;
      else if (row.type === "dislike") entry.dislikes = n;
    }
    return map;
  }

  async viewerGifReactionsFor(
    gifIds: string[],
    userId: string,
  ): Promise<Map<string, ReactionType>> {
    if (gifIds.length === 0) return new Map();
    const rows = await this.gifReactions.find({
      where: { userId, gifId: In(gifIds) },
    });
    return new Map(rows.map((r) => [r.gifId, r.type]));
  }
}
