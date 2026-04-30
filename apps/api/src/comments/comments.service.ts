import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import type { CommentSort } from "@repo/shared";
import { Comment } from "./comment.entity";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { S3Service } from "../s3/s3.service";

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    private readonly reactionsService: ReactionsService,
    private readonly s3: S3Service,
  ) {}

  async listByVideo(
    videoId: string,
    viewerId?: string | null,
    sort: CommentSort = "newest",
  ) {
    const items = await this.comments.find({
      where: { videoId },
      order: { createdAt: "ASC" },
    });

    const ids = items.map((c) => c.id);
    const [counts, viewerReactions] = await Promise.all([
      this.reactionsService.commentCountsFor(ids),
      viewerId
        ? this.reactionsService.viewerCommentReactionsFor(ids, viewerId)
        : Promise.resolve(new Map<string, ReactionType>()),
    ]);

    // Resolve avatar URLs once per unique author. Users with an uploaded
    // avatar have it stored under `avatarS3Key`; we need to presign that
    // before sending it to the client (otherwise the field is null and the
    // UI falls back to the initial-letter avatar).
    const authorById = new Map<string, Comment["author"]>();
    for (const c of items) authorById.set(c.author.id, c.author);
    const avatarByAuthor = new Map<string, string | null>();
    await Promise.all(
      [...authorById.values()].map(async (a) => {
        const url = a.avatarS3Key
          ? await this.s3.presignGet(a.avatarS3Key)
          : (a.avatarUrl ?? null);
        avatarByAuthor.set(a.id, url);
      }),
    );

    const enriched = items.map((c) => {
      const counts_ = counts.get(c.id) ?? { likes: 0, dislikes: 0 };
      return {
        id: c.id,
        videoId: c.videoId,
        parentId: c.parentId,
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        author: {
          id: c.author.id,
          name: c.author.name,
          avatarUrl: avatarByAuthor.get(c.author.id) ?? null,
        },
        likeCount: counts_.likes,
        dislikeCount: counts_.dislikes,
        viewerReaction: viewerReactions.get(c.id) ?? null,
      };
    });

    if (sort === "newest") return enriched;

    // For non-newest sort: re-rank ROOTS by counts; replies stay attached
    // to their parent (the frontend re-threads from the array order).
    const roots = enriched.filter((c) => !c.parentId);
    const replies = enriched.filter((c) => c.parentId);
    const cmp = (a: typeof roots[number], b: typeof roots[number]) => {
      const aCount = sort === "mostLiked" ? a.likeCount : a.dislikeCount;
      const bCount = sort === "mostLiked" ? b.likeCount : b.dislikeCount;
      if (aCount !== bCount) return bCount - aCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    };
    roots.sort(cmp);
    return [...roots, ...replies];
  }

  async create(
    videoId: string,
    authorId: string,
    body: string,
    parentId?: string | null,
  ): Promise<Comment> {
    if (parentId) {
      const parent = await this.comments.findOne({
        where: { id: parentId },
      });
      if (!parent || parent.videoId !== videoId) {
        throw new NotFoundException("Parent comment not found");
      }
      // Flatten — replies always live one level deep, attached to the
      // top-level comment in the thread.
      if (parent.parentId) parentId = parent.parentId;
    }
    const comment = this.comments.create({
      videoId,
      authorId,
      body,
      parentId: parentId ?? null,
    });
    const saved = await this.comments.save(comment);
    return this.comments.findOneOrFail({ where: { id: saved.id } });
  }

  async update(id: string, authorId: string, body: string): Promise<Comment> {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.authorId !== authorId) {
      throw new ForbiddenException("Not the author");
    }
    comment.body = body;
    await this.comments.save(comment);
    return this.comments.findOneOrFail({ where: { id } });
  }

  async delete(id: string, authorId: string): Promise<{ id: string }> {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) throw new NotFoundException("Comment not found");
    if (comment.authorId !== authorId) {
      throw new ForbiddenException("Not the author");
    }
    // Replies cascade-delete via the FK constraint on parentId.
    await this.comments.remove(comment);
    return { id };
  }

  // Kept for callers/tests that want only top-level threads.
  listRoots(videoId: string): Promise<Comment[]> {
    return this.comments.find({
      where: { videoId, parentId: IsNull() },
      order: { createdAt: "DESC" },
    });
  }
}
