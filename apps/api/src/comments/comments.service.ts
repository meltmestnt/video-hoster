import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import type { CommentSort } from "@repo/shared";
import { Comment } from "./comment.entity";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    private readonly reactionsService: ReactionsService,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

  async listByVideo(
    videoId: string,
    viewerId?: string | null,
    sort: CommentSort = "newest",
  ) {
    return this.listForSubject({ videoId }, viewerId, sort);
  }

  async listByGif(
    gifId: string,
    viewerId?: string | null,
    sort: CommentSort = "newest",
  ) {
    return this.listForSubject({ gifId }, viewerId, sort);
  }

  private async listForSubject(
    where: { videoId: string } | { gifId: string },
    viewerId: string | null | undefined,
    sort: CommentSort,
  ) {
    const items = await this.comments.find({
      where,
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
          ? await this.media.signUrl({ kind: "avatar", id: a.id })
          : (a.avatarUrl ?? null);
        avatarByAuthor.set(a.id, url);
      }),
    );

    const enriched = items.map((c) => {
      const counts_ = counts.get(c.id) ?? { likes: 0, dislikes: 0 };
      return {
        id: c.id,
        videoId: c.videoId,
        gifId: c.gifId,
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
    return this.createForSubject({ videoId }, authorId, body, parentId);
  }

  async createOnGif(
    gifId: string,
    authorId: string,
    body: string,
    parentId?: string | null,
  ): Promise<Comment> {
    return this.createForSubject({ gifId }, authorId, body, parentId);
  }

  private async createForSubject(
    subject: { videoId: string } | { gifId: string },
    authorId: string,
    body: string,
    parentId?: string | null,
  ): Promise<Comment> {
    if (parentId) {
      const parent = await this.comments.findOne({
        where: { id: parentId },
      });
      const sameSubject =
        "videoId" in subject
          ? parent?.videoId === subject.videoId
          : parent?.gifId === subject.gifId;
      if (!parent || !sameSubject) {
        throw new NotFoundException("Parent comment not found");
      }
      // Flatten — replies always live one level deep, attached to the
      // top-level comment in the thread.
      if (parent.parentId) parentId = parent.parentId;
    }
    const comment = this.comments.create({
      videoId: "videoId" in subject ? subject.videoId : null,
      gifId: "gifId" in subject ? subject.gifId : null,
      authorId,
      body,
      parentId: parentId ?? null,
    });
    const saved = await this.comments.save(comment);
    const subjectField =
      "videoId" in subject
        ? `videoId=${subject.videoId}`
        : `gifId=${subject.gifId}`;
    this.logger.log(
      `comments.create actorId=${authorId} commentId=${saved.id} ${subjectField} parentId=${parentId ?? "null"} bodyLen=${body.length}`,
    );
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
    this.logger.log(
      `comments.update actorId=${authorId} commentId=${id} videoId=${comment.videoId ?? "null"} gifId=${comment.gifId ?? "null"} parentId=${comment.parentId ?? "null"}`,
    );
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
    this.logger.log(
      `comments.delete actorId=${authorId} commentId=${id} videoId=${comment.videoId ?? "null"} gifId=${comment.gifId ?? "null"} parentId=${comment.parentId ?? "null"}`,
    );
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
