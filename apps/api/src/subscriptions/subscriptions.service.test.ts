import { describe, expect, it, beforeEach, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { SubscriptionsService } from "./subscriptions.service";
import type { Subscription } from "./subscription.entity";
import type { User } from "../users/user.entity";
import type { S3Service } from "../s3/s3.service";
import type { MediaService } from "../media/media.service";
import { createMockRepo, createMockQueryBuilder } from "../../test/mock-repo";

function makeSvc() {
  const subs = createMockRepo<Subscription>();
  const users = createMockRepo<User>();
  const s3 = {} as S3Service;
  const media = {
    signUrl: vi.fn(async () => "https://signed.example/avatar"),
  } as unknown as MediaService;
  const svc = new SubscriptionsService(
    subs as unknown as Repository<Subscription>,
    users as unknown as Repository<User>,
    s3,
    media,
  );
  return { svc, subs, users, media };
}

describe("SubscriptionsService.toggle", () => {
  it("rejects self-subscription up front (no DB calls)", async () => {
    const { svc, subs, users } = makeSvc();
    await expect(svc.toggle("u-1", "u-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(subs.findOne).not.toHaveBeenCalled();
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it("rejects when the target user doesn't exist", async () => {
    const { svc, users } = makeSvc();
    users.findOne.mockResolvedValueOnce(null);
    await expect(svc.toggle("u-1", "u-2")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates the subscription when none exists", async () => {
    const { svc, subs, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({ id: "u-2" } as User);
    subs.findOne.mockResolvedValueOnce(null);
    subs.count.mockResolvedValueOnce(7);
    const result = await svc.toggle("u-1", "u-2");
    expect(result).toEqual({ subscribed: true, followerCount: 7 });
    expect(subs.create).toHaveBeenCalledWith({
      subscriberId: "u-1",
      targetUserId: "u-2",
    });
    expect(subs.save).toHaveBeenCalled();
    expect(subs.delete).not.toHaveBeenCalled();
  });

  it("removes the subscription when one already exists", async () => {
    const { svc, subs, users } = makeSvc();
    users.findOne.mockResolvedValueOnce({ id: "u-2" } as User);
    subs.findOne.mockResolvedValueOnce({
      id: "sub-1",
      subscriberId: "u-1",
      targetUserId: "u-2",
    } as Subscription);
    subs.count.mockResolvedValueOnce(6);
    const result = await svc.toggle("u-1", "u-2");
    expect(result).toEqual({ subscribed: false, followerCount: 6 });
    expect(subs.delete).toHaveBeenCalledWith({ id: "sub-1" });
    expect(subs.save).not.toHaveBeenCalled();
  });
});

describe("SubscriptionsService — read-only helpers", () => {
  it("isSubscribed returns true when count>0, false otherwise", async () => {
    const { svc, subs } = makeSvc();
    subs.count.mockResolvedValueOnce(2);
    expect(await svc.isSubscribed("u-1", "u-2")).toBe(true);
    subs.count.mockResolvedValueOnce(0);
    expect(await svc.isSubscribed("u-1", "u-2")).toBe(false);
  });

  it("followerCount + followingCount delegate straight to count()", async () => {
    const { svc, subs } = makeSvc();
    subs.count.mockResolvedValueOnce(3);
    expect(await svc.followerCount("u-2")).toBe(3);
    subs.count.mockResolvedValueOnce(11);
    expect(await svc.followingCount("u-1")).toBe(11);
  });

  it("subscriberIdsOf returns just the subscriberId column", async () => {
    const { svc, subs } = makeSvc();
    subs.find.mockResolvedValueOnce([
      { subscriberId: "u-a" },
      { subscriberId: "u-b" },
    ] as unknown as Subscription[]);
    expect(await svc.subscriberIdsOf("u-2")).toEqual(["u-a", "u-b"]);
  });
});

describe("SubscriptionsService.listFollowing / listFollowers", () => {
  it("returns empty page + null cursor when no rows match", async () => {
    const { svc, subs } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getMany = vi.fn(async () => []);
    subs.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    const page = await svc.listFollowing("u-1", undefined, 10);
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it("returns up to limit items + a nextCursor when more exist", async () => {
    const { svc, subs, users } = makeSvc();
    const qb = createMockQueryBuilder();
    // Return limit+1 rows so the service knows there's more.
    qb.getMany = vi.fn(async () =>
      [
        { id: "s-1", targetUserId: "u-2", createdAt: new Date(2026, 0, 3) },
        { id: "s-2", targetUserId: "u-3", createdAt: new Date(2026, 0, 2) },
        { id: "s-3", targetUserId: "u-4", createdAt: new Date(2026, 0, 1) },
      ] as unknown as Subscription[],
    );
    subs.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    users.find.mockResolvedValueOnce([
      { id: "u-2", name: "B", avatarUrl: null, avatarS3Key: null },
      { id: "u-3", name: "C", avatarUrl: null, avatarS3Key: null },
    ] as unknown as User[]);

    const page = await svc.listFollowing("u-1", undefined, 2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0].id).toBe("u-2");
    expect(page.nextCursor).toBe("s-2");
  });

  it("uses media.signUrl when the user has an avatarS3Key", async () => {
    const { svc, subs, users, media } = makeSvc();
    const qb = createMockQueryBuilder();
    qb.getMany = vi.fn(async () => [
      { id: "s-1", targetUserId: "u-2", createdAt: new Date() },
    ] as unknown as Subscription[]);
    subs.createQueryBuilder.mockReturnValueOnce(
      qb as unknown as ReturnType<typeof createMockQueryBuilder>,
    );
    users.find.mockResolvedValueOnce([
      {
        id: "u-2",
        name: "B",
        avatarUrl: "https://google/raw.png",
        avatarS3Key: "avatars/u-2/avatar.jpg",
      },
    ] as unknown as User[]);
    const page = await svc.listFollowing("u-1", undefined, 10);
    expect(media.signUrl).toHaveBeenCalledWith({
      kind: "avatar",
      id: "u-2",
    });
    expect(page.items[0].avatarUrl).toBe("https://signed.example/avatar");
  });
});
