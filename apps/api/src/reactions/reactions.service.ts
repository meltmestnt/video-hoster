import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ReactionType, VideoReaction } from "./reaction.entity";
import { CommentReaction } from "./comment-reaction.entity";

export interface VideoReactionCounts {
  likes: number;
  dislikes: number;
}

@Injectable()
export class ReactionsService {
  constructor(
    @InjectRepository(VideoReaction)
    private readonly reactions: Repository<VideoReaction>,
    @InjectRepository(CommentReaction)
    private readonly commentReactions: Repository<CommentReaction>,
  ) {}

  async setReaction(videoId: string, userId: string, type: ReactionType) {
    const existing = await this.reactions.findOne({
      where: { videoId, userId },
    });
    if (existing) {
      if (existing.type === type) {
        // Same reaction → toggle off
        await this.reactions.delete({ id: existing.id });
        return { reaction: null as ReactionType | null };
      }
      existing.type = type;
      await this.reactions.save(existing);
      return { reaction: type };
    }
    await this.reactions.save(this.reactions.create({ videoId, userId, type }));
    return { reaction: type };
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
    if (existing) {
      if (existing.type === type) {
        await this.commentReactions.delete({ id: existing.id });
        return { reaction: null as ReactionType | null };
      }
      existing.type = type;
      await this.commentReactions.save(existing);
      return { reaction: type };
    }
    await this.commentReactions.save(
      this.commentReactions.create({ commentId, userId, type }),
    );
    return { reaction: type };
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
}
