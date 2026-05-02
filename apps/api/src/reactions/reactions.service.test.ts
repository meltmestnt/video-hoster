import { describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import { ReactionsService } from "./reactions.service";
import type { VideoReaction } from "./reaction.entity";
import type { CommentReaction } from "./comment-reaction.entity";
import type { GifReaction } from "./gif-reaction.entity";
import type { NotificationsService } from "../notifications/notifications.service";
import type { MediaService } from "../media/media.service";
import { createMockRepo, createMockQueryBuilder } from "../../test/mock-repo";

function makeSvc() {
  const reactions = createMockRepo<VideoReaction>();
  const commentReactions = createMockRepo<CommentReaction>();
  const gifReactions = createMockRepo<GifReaction>();
  const notifications = {
    onVideoReaction: vi.fn(async () => undefined),
    onGifReaction: vi.fn(async () => undefined),
  } as unknown as NotificationsService;
  const media = {
    signUrl: vi.fn(async () => "https://signed/avatar"),
  } as unknown as MediaService;
  const svc = new ReactionsService(
    reactions as unknown as Repository<VideoReaction>,
    commentReactions as unknown as Repository<CommentReaction>,
    gifReactions as unknown as Repository<GifReaction>,
    notifications,
    media,
  );
  return { svc, reactions, commentReactions, gifReactions, notifications };
}

describe("ReactionsService.setReaction (videos)", () => {
  it("creates a new reaction when none exists", async () => {
    const { svc, reactions, notifications } = makeSvc();
    reactions.findOne.mockResolvedValueOnce(null);
    const out = await svc.setReaction("v-1", "u-1", "like");
    expect(out).toEqual({ reaction: "like" });
    expect(reactions.create).toHaveBeenCalledWith({
      videoId: "v-1",
      userId: "u-1",
      type: "like",
    });
    expect(notifications.onVideoReaction).toHaveBeenCalledWith(
      "v-1",
      "u-1",
      "like",
    );
  });

  it("removes the reaction when the same type is sent again (toggle off)", async () => {
    const { svc, reactions, notifications } = makeSvc();
    reactions.findOne.mockResolvedValueOnce({
      id: "r-1",
      videoId: "v-1",
      userId: "u-1",
      type: "like",
    } as unknown as VideoReaction);
    const out = await svc.setReaction("v-1", "u-1", "like");
    expect(out).toEqual({ reaction: null });
    expect(reactions.delete).toHaveBeenCalledWith({ id: "r-1" });
    expect(notifications.onVideoReaction).toHaveBeenCalledWith(
      "v-1",
      "u-1",
      null,
    );
  });

  it("changes the type when a different one is sent", async () => {
    const { svc, reactions, notifications } = makeSvc();
    const existing = {
      id: "r-1",
      videoId: "v-1",
      userId: "u-1",
      type: "like",
    } as unknown as VideoReaction;
    reactions.findOne.mockResolvedValueOnce(existing);
    const out = await svc.setReaction("v-1", "u-1", "dislike");
    expect(out).toEqual({ reaction: "dislike" });
    expect(existing.type).toBe("dislike");
    expect(reactions.save).toHaveBeenCalledWith(existing);
    expect(reactions.delete).not.toHaveBeenCalled();
    expect(notifications.onVideoReaction).toHaveBeenCalledWith(
      "v-1",
      "u-1",
      "dislike",
    );
  });
});

describe("ReactionsService.setGifReaction", () => {
  it("creates a new reaction when none exists", async () => {
    const { svc, gifReactions, notifications } = makeSvc();
    gifReactions.findOne.mockResolvedValueOnce(null);
    const out = await svc.setGifReaction("g-1", "u-1", "like");
    expect(out).toEqual({ reaction: "like" });
    expect(notifications.onGifReaction).toHaveBeenCalledWith(
      "g-1",
      "u-1",
      "like",
    );
  });

  it("toggles off when the same type is sent again", async () => {
    const { svc, gifReactions } = makeSvc();
    gifReactions.findOne.mockResolvedValueOnce({
      id: "r-1",
      gifId: "g-1",
      userId: "u-1",
      type: "dislike",
    } as unknown as GifReaction);
    const out = await svc.setGifReaction("g-1", "u-1", "dislike");
    expect(out.reaction).toBeNull();
    expect(gifReactions.delete).toHaveBeenCalled();
  });
});

describe("ReactionsService.setCommentReaction", () => {
  it("creates a new comment reaction without firing notifications", async () => {
    const { svc, commentReactions, notifications } = makeSvc();
    commentReactions.findOne.mockResolvedValueOnce(null);
    const out = await svc.setCommentReaction("c-1", "u-1", "like");
    expect(out).toEqual({ reaction: "like" });
    // Comment reactions don't fan out via NotificationsService — verify
    // the video / gif reaction hooks are NOT touched here so future
    // refactors don't accidentally start spamming notifications.
    expect(notifications.onVideoReaction).not.toHaveBeenCalled();
    expect(notifications.onGifReaction).not.toHaveBeenCalled();
  });
});

describe("ReactionsService.countsFor (videos)", () => {
  it("returns an empty Map for an empty input list (no DB hit)", async () => {
    const { svc, reactions } = makeSvc();
    const map = await svc.countsFor([]);
    expect(map.size).toBe(0);
    expect(reactions.createQueryBuilder).not.toHaveBeenCalled();
  });

  it("seeds zero counts for every requested id and overlays the aggregated rows", async () => {
    const { svc, reactions } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getRawMany = vi.fn(async () => [
      { videoId: "v-1", type: "like", count: "5" },
      { videoId: "v-1", type: "dislike", count: "1" },
      { videoId: "v-2", type: "like", count: "2" },
    ]);
    reactions.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    const map = await svc.countsFor(["v-1", "v-2", "v-3"]);
    expect(map.get("v-1")).toEqual({ likes: 5, dislikes: 1 });
    expect(map.get("v-2")).toEqual({ likes: 2, dislikes: 0 });
    // v-3 had no rows but still appears with zeros so callers don't
    // have to defensively `?? { likes:0, dislikes:0 }` everywhere.
    expect(map.get("v-3")).toEqual({ likes: 0, dislikes: 0 });
  });

  it("ignores raw rows whose type is neither 'like' nor 'dislike'", async () => {
    const { svc, reactions } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getRawMany = vi.fn(async () => [
      { videoId: "v-1", type: "spam", count: "9" },
    ]);
    reactions.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    const map = await svc.countsFor(["v-1"]);
    expect(map.get("v-1")).toEqual({ likes: 0, dislikes: 0 });
  });
});

describe("ReactionsService.viewerReactionsFor", () => {
  it("returns empty map for empty input list", async () => {
    const { svc, reactions } = makeSvc();
    const map = await svc.viewerReactionsFor([], "u-1");
    expect(map.size).toBe(0);
    expect(reactions.find).not.toHaveBeenCalled();
  });

  it("maps videoId → reaction type for the viewer", async () => {
    const { svc, reactions } = makeSvc();
    reactions.find.mockResolvedValueOnce([
      { videoId: "v-1", type: "like" },
      { videoId: "v-2", type: "dislike" },
    ] as unknown as VideoReaction[]);
    const map = await svc.viewerReactionsFor(["v-1", "v-2", "v-3"], "u-1");
    expect(map.get("v-1")).toBe("like");
    expect(map.get("v-2")).toBe("dislike");
    expect(map.has("v-3")).toBe(false);
  });
});
