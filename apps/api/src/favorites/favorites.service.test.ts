import { describe, expect, it, beforeEach } from "vitest";
import type { Repository } from "typeorm";
import { FavoritesService } from "./favorites.service";
import type { VideoFavorite } from "./favorite.entity";
import { createMockRepo } from "../../test/mock-repo";

function makeSvc() {
  const repo = createMockRepo<VideoFavorite>();
  const svc = new FavoritesService(
    repo as unknown as Repository<VideoFavorite>,
  );
  return { svc, repo };
}

describe("FavoritesService.toggle", () => {
  it("adds a favorite when none exists and reports favorited=true", async () => {
    const { svc, repo } = makeSvc();
    repo.findOne.mockResolvedValueOnce(null as VideoFavorite | null);
    const result = await svc.toggle("v-1", "u-1");
    expect(result).toEqual({ favorited: true });
    expect(repo.create).toHaveBeenCalledWith({
      videoId: "v-1",
      userId: "u-1",
    });
    expect(repo.save).toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it("removes the existing favorite and reports favorited=false", async () => {
    const { svc, repo } = makeSvc();
    repo.findOne.mockResolvedValueOnce({
      id: "fav-1",
      videoId: "v-1",
      userId: "u-1",
    } as unknown as VideoFavorite);
    const result = await svc.toggle("v-1", "u-1");
    expect(result).toEqual({ favorited: false });
    expect(repo.delete).toHaveBeenCalledWith({ id: "fav-1" });
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe("FavoritesService.favoritedSet", () => {
  it("returns an empty Set for an empty input list (no DB hit)", async () => {
    const { svc, repo } = makeSvc();
    const set = await svc.favoritedSet([], "u-1");
    expect(set.size).toBe(0);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it("returns the set of videoIds the user has favorited from the requested batch", async () => {
    const { svc, repo } = makeSvc();
    repo.find.mockResolvedValueOnce([
      { videoId: "v-1", userId: "u-1" },
      { videoId: "v-3", userId: "u-1" },
    ] as unknown as VideoFavorite[]);
    const set = await svc.favoritedSet(["v-1", "v-2", "v-3"], "u-1");
    expect(set.has("v-1")).toBe(true);
    expect(set.has("v-2")).toBe(false);
    expect(set.has("v-3")).toBe(true);
  });
});

describe("FavoritesService.isFavorited", () => {
  it("returns true when a row exists", async () => {
    const { svc, repo } = makeSvc();
    repo.findOne.mockResolvedValueOnce({
      id: "fav-1",
    } as unknown as VideoFavorite);
    expect(await svc.isFavorited("v-1", "u-1")).toBe(true);
  });

  it("returns false when no row exists", async () => {
    const { svc, repo } = makeSvc();
    repo.findOne.mockResolvedValueOnce(null);
    expect(await svc.isFavorited("v-1", "u-1")).toBe(false);
  });
});
