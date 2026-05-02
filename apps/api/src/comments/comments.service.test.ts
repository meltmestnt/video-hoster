import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { CommentsService } from "./comments.service";
import type { Comment } from "./comment.entity";
import type { ReactionsService } from "../reactions/reactions.service";
import type { S3Service } from "../s3/s3.service";
import type { MediaService } from "../media/media.service";
import { createMockRepo } from "../../test/mock-repo";

function makeSvc() {
  const comments = createMockRepo<Comment>() as ReturnType<
    typeof createMockRepo<Comment>
  > & { findOneOrFail: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  // The service uses findOneOrFail / remove which our base mock doesn't
  // include — bolt them on here so the test surface matches.
  comments.findOneOrFail = vi.fn(async (_args: unknown) => null as Comment | null);
  comments.remove = vi.fn(async (entity: Comment) => entity);

  const reactions = {
    commentCountsFor: vi.fn(async (_ids: string[]) => new Map()),
    viewerCommentReactionsFor: vi.fn(async (_ids: string[], _u: string) => new Map()),
  } as unknown as ReactionsService;
  const s3 = {} as S3Service;
  const media = {
    signUrl: vi.fn(async () => "https://signed/avatar"),
  } as unknown as MediaService;

  const svc = new CommentsService(
    comments as unknown as Repository<Comment>,
    reactions,
    s3,
    media,
  );
  return { svc, comments, reactions, media };
}

describe("CommentsService.create (videos)", () => {
  it("creates a top-level comment without a parent", async () => {
    const { svc, comments } = makeSvc();
    comments.save.mockResolvedValueOnce({ id: "c-1" } as Comment);
    comments.findOneOrFail.mockResolvedValueOnce({
      id: "c-1",
    } as Comment);
    await svc.create("v-1", "u-1", "Nice");
    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: "v-1",
        gifId: null,
        authorId: "u-1",
        body: "Nice",
        parentId: null,
      }),
    );
  });

  it("rejects when parent comment doesn't exist", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.create("v-1", "u-1", "reply", "missing-parent"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(comments.save).not.toHaveBeenCalled();
  });

  it("rejects a reply whose parent belongs to a different video", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "p-1",
      videoId: "different-video",
    } as Comment);
    await expect(
      svc.create("v-1", "u-1", "reply", "p-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("flattens replies one level deep — replying to a reply attaches to its parent", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "p-2",
      videoId: "v-1",
      parentId: "p-root",
    } as Comment);
    comments.save.mockResolvedValueOnce({ id: "c-new" } as Comment);
    comments.findOneOrFail.mockResolvedValueOnce({ id: "c-new" } as Comment);
    await svc.create("v-1", "u-1", "reply", "p-2");
    // create() should have been called with parentId === "p-root", not "p-2".
    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "p-root" }),
    );
  });

  it("attaches a top-level reply when the parent has no parent", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "p-1",
      videoId: "v-1",
      parentId: null,
    } as Comment);
    comments.save.mockResolvedValueOnce({ id: "c-new" } as Comment);
    comments.findOneOrFail.mockResolvedValueOnce({ id: "c-new" } as Comment);
    await svc.create("v-1", "u-1", "reply", "p-1");
    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "p-1" }),
    );
  });
});

describe("CommentsService.createOnGif", () => {
  it("dispatches to the gif subject (videoId=null)", async () => {
    const { svc, comments } = makeSvc();
    comments.save.mockResolvedValueOnce({ id: "c-1" } as Comment);
    comments.findOneOrFail.mockResolvedValueOnce({ id: "c-1" } as Comment);
    await svc.createOnGif("g-1", "u-1", "Cool gif");
    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: null,
        gifId: "g-1",
        body: "Cool gif",
      }),
    );
  });

  it("rejects a reply whose parent belongs to a different gif", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "p-1",
      gifId: "different-gif",
    } as Comment);
    await expect(
      svc.createOnGif("g-1", "u-1", "reply", "p-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CommentsService.update", () => {
  it("404s when the comment doesn't exist", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce(null);
    await expect(svc.update("c-1", "u-1", "edit")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("forbids editing someone else's comment", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "c-1",
      authorId: "u-other",
    } as Comment);
    await expect(svc.update("c-1", "u-1", "edit")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(comments.save).not.toHaveBeenCalled();
  });

  it("saves the new body when the author matches", async () => {
    const { svc, comments } = makeSvc();
    const existing = {
      id: "c-1",
      authorId: "u-1",
      body: "old",
    } as Comment;
    comments.findOne.mockResolvedValueOnce(existing);
    comments.findOneOrFail.mockResolvedValueOnce({
      ...existing,
      body: "new",
    } as Comment);
    await svc.update("c-1", "u-1", "new");
    expect(existing.body).toBe("new");
    expect(comments.save).toHaveBeenCalledWith(existing);
  });
});

describe("CommentsService.delete", () => {
  it("404s when the comment doesn't exist", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce(null);
    await expect(svc.delete("c-1", "u-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("forbids deleting someone else's comment", async () => {
    const { svc, comments } = makeSvc();
    comments.findOne.mockResolvedValueOnce({
      id: "c-1",
      authorId: "u-other",
    } as Comment);
    await expect(svc.delete("c-1", "u-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(comments.remove).not.toHaveBeenCalled();
  });

  it("removes the comment when the author matches", async () => {
    const { svc, comments } = makeSvc();
    const existing = {
      id: "c-1",
      authorId: "u-1",
      videoId: "v-1",
      gifId: null,
    } as Comment;
    comments.findOne.mockResolvedValueOnce(existing);
    const out = await svc.delete("c-1", "u-1");
    expect(comments.remove).toHaveBeenCalledWith(existing);
    expect(out).toEqual({ id: "c-1" });
  });
});

describe("CommentsService.listByVideo (sorting)", () => {
  function withItems(items: Partial<Comment>[]) {
    const { svc, comments, reactions } = makeSvc();
    comments.find.mockResolvedValueOnce(
      items.map((c) => ({
        author: { id: c.authorId ?? "u", name: "X", username: null, avatarS3Key: null, avatarUrl: null },
        ...c,
      })) as unknown as Comment[],
    );
    return { svc, comments, reactions };
  }

  it("returns items in ASC createdAt order for sort='newest'", async () => {
    const { svc } = withItems([
      { id: "c-1", body: "a", createdAt: new Date(2026, 0, 1), authorId: "u-1" },
      { id: "c-2", body: "b", createdAt: new Date(2026, 0, 2), authorId: "u-1" },
    ]);
    const out = await svc.listByVideo("v-1");
    expect(out.map((c) => c.id)).toEqual(["c-1", "c-2"]);
  });

  it("ranks roots by likeCount when sort='mostLiked' and keeps replies at the bottom", async () => {
    const { svc, reactions } = withItems([
      { id: "root-a", parentId: null, body: "a", createdAt: new Date(2026, 0, 1), authorId: "u-1" },
      { id: "root-b", parentId: null, body: "b", createdAt: new Date(2026, 0, 2), authorId: "u-1" },
      { id: "reply-a", parentId: "root-a", body: "r", createdAt: new Date(2026, 0, 3), authorId: "u-1" },
    ]);
    (reactions.commentCountsFor as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Map([
        ["root-a", { likes: 1, dislikes: 0 }],
        ["root-b", { likes: 5, dislikes: 0 }],
        ["reply-a", { likes: 100, dislikes: 0 }],
      ]),
    );
    const out = await svc.listByVideo("v-1", null, "mostLiked");
    // root-b (5 likes) outranks root-a (1 like). Replies always come last
    // regardless of their own counts.
    expect(out.map((c) => c.id)).toEqual(["root-b", "root-a", "reply-a"]);
  });

  it("breaks count ties by createdAt DESC", async () => {
    const { svc, reactions } = withItems([
      { id: "root-a", parentId: null, body: "a", createdAt: new Date(2026, 0, 1), authorId: "u-1" },
      { id: "root-b", parentId: null, body: "b", createdAt: new Date(2026, 0, 2), authorId: "u-1" },
    ]);
    (reactions.commentCountsFor as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Map([
        ["root-a", { likes: 3, dislikes: 0 }],
        ["root-b", { likes: 3, dislikes: 0 }],
      ]),
    );
    const out = await svc.listByVideo("v-1", null, "mostLiked");
    expect(out.map((c) => c.id)).toEqual(["root-b", "root-a"]);
  });
});
