import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { Repository } from "typeorm";
import { FoldersService } from "./folders.service";
import type { Folder } from "./folder.entity";
import type { FolderGif } from "./folder-gif.entity";
import type { FolderShare } from "./folder-share.entity";
import type { Gif } from "../gifs/gif.entity";
import type { User } from "../users/user.entity";
import { createMockQueryBuilder, createMockRepo } from "../../test/mock-repo";

// Folder ownership lookup that the service runs first (`findReadable`
// → falls back to `findOwned`). Tests that don't care about access
// control can ignore this — every helper builds a service that
// resolves the owned-folder check by default.
function makeSvc() {
  const folders = createMockRepo<Folder>();
  const folderGifs = createMockRepo<FolderGif>();
  const folderShares = createMockRepo<FolderShare>();
  const gifs = createMockRepo<Gif>();
  const users = createMockRepo<User>();
  const svc = new FoldersService(
    folders as unknown as Repository<Folder>,
    folderGifs as unknown as Repository<FolderGif>,
    folderShares as unknown as Repository<FolderShare>,
    gifs as unknown as Repository<Gif>,
    users as unknown as Repository<User>,
  );
  // Default ownership: caller owns this folder. Tests that need the
  // recipient path can override findOne on the folders repo.
  folders.findOne.mockResolvedValue({
    id: "f-1",
    ownerId: "u-1",
  } as unknown as Folder);
  return { svc, folders, folderGifs, folderShares, gifs, users };
}

describe("FoldersService.listGifIds — filters", () => {
  it("uses the unfiltered hot path when no q or tag is set", async () => {
    const { svc, folderGifs } = makeSvc();
    // Build a fresh QB so we can spy on it; createMockQueryBuilder
    // returns chainable vi.fn()s plus terminal getRawMany() etc.
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", { limit: 10 });

    // No innerJoin at all — that's the entire point of the fast path.
    expect(qb.innerJoin).not.toHaveBeenCalled();
    // andWhere is also untouched in this branch (cursor is also null).
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it("joins gifs and adds a title-or-tag ILIKE predicate when q is set", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", { limit: 10, q: "cat" });

    expect(qb.innerJoin).toHaveBeenCalledWith(
      "gifs",
      "g",
      expect.stringContaining(`g.id = fg."gifId"`),
    );
    // The ILIKE param is bound as %escaped%; verify both shape and
    // that the wildcard is the *bound* one (no SQL injection of % into
    // the query body).
    const call = qb.andWhere.mock.calls.find(
      (c) => /ILIKE :qLike/.test(String(c[0])),
    );
    expect(call).toBeTruthy();
    expect(call?.[1]).toEqual({ qLike: "%cat%" });
  });

  it("escapes %, _, and \\ in the q parameter before binding the ILIKE pattern", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", { limit: 10, q: "50%_off\\back" });
    const call = qb.andWhere.mock.calls.find(
      (c) => /ILIKE :qLike/.test(String(c[0])),
    );
    expect(call?.[1]).toEqual({ qLike: "%50\\%\\_off\\\\back%" });
  });

  it("adds an exact-name tag predicate, lowercased, when tag is set", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", { limit: 10, tag: "  CAT  " });
    const call = qb.andWhere.mock.calls.find(
      (c) => /t3\.name = :tagName/.test(String(c[0])),
    );
    expect(call).toBeTruthy();
    expect(call?.[1]).toEqual({ tagName: "cat" });
  });

  it("ANDs both predicates when q and tag are set together", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", {
      limit: 10,
      q: "loop",
      tag: "meme",
    });

    const calls = qb.andWhere.mock.calls;
    expect(
      calls.some((c) => /ILIKE :qLike/.test(String(c[0]))),
    ).toBe(true);
    expect(
      calls.some((c) => /t3\.name = :tagName/.test(String(c[0]))),
    ).toBe(true);
  });

  it("treats whitespace-only q and tag as 'no filter' (no innerJoin)", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);

    await svc.listGifIds("u-1", "f-1", { limit: 10, q: "   ", tag: "  " });
    expect(qb.innerJoin).not.toHaveBeenCalled();
  });

  it("paginates: returns N items + nextCursor when getRawMany returns N+1 rows", async () => {
    const { svc, folderGifs } = makeSvc();
    const qb = createMockQueryBuilder();
    folderGifs.createQueryBuilder.mockReturnValue(qb);
    // limit=2 → service takes 3, returns first 2 + cursor = id of last
    // returned row.
    qb.getRawMany.mockResolvedValueOnce([
      { gifId: "g-1" },
      { gifId: "g-2" },
      { gifId: "g-3" },
    ]);

    const result = await svc.listGifIds("u-1", "f-1", { limit: 2 });
    expect(result.ids).toEqual(["g-1", "g-2"]);
    expect(result.nextCursor).toBe("g-2");
  });
});

describe("FoldersService.listFolderTags", () => {
  it("returns rows with counts coerced to numbers", async () => {
    const { svc, folderGifs } = makeSvc();
    folderGifs.manager.query.mockResolvedValueOnce([
      { name: "cat", count: "12" },
      { name: "loop", count: "3" },
    ]);

    const result = await svc.listFolderTags("u-1", "f-1", 10);
    expect(result).toEqual([
      { name: "cat", count: 12 },
      { name: "loop", count: 3 },
    ]);
  });

  it("clamps the limit between 1 and 50", async () => {
    const { svc, folderGifs } = makeSvc();

    await svc.listFolderTags("u-1", "f-1", 0);
    expect(folderGifs.manager.query.mock.calls[0]?.[1]?.[1]).toBe(1);

    folderGifs.manager.query.mockClear();
    await svc.listFolderTags("u-1", "f-1", 999);
    expect(folderGifs.manager.query.mock.calls[0]?.[1]?.[1]).toBe(50);
  });

  it("404s when the caller has no access to the folder", async () => {
    const { svc, folders, folderShares } = makeSvc();
    folders.findOne.mockResolvedValue({
      id: "f-1",
      ownerId: "other-user",
    } as unknown as Folder);
    folderShares.findOne.mockResolvedValue(null);

    await expect(
      svc.listFolderTags("u-1", "f-1", 10),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("works for a recipient (shared-folder access)", async () => {
    const { svc, folders, folderShares, folderGifs } = makeSvc();
    folders.findOne.mockResolvedValue({
      id: "f-1",
      ownerId: "owner",
    } as unknown as Folder);
    folderShares.findOne.mockResolvedValue({
      folderId: "f-1",
      recipientUserId: "u-1",
    } as unknown as FolderShare);
    folderGifs.manager.query.mockResolvedValueOnce([
      { name: "share", count: "1" },
    ]);

    const result = await svc.listFolderTags("u-1", "f-1", 10);
    expect(result).toEqual([{ name: "share", count: 1 }]);
  });
});

// ─── Sharing ──────────────────────────────────────────────────────────
const ownerId = "u-owner";
const recipientId = "u-recipient";
const folderId = "f-1";

function ownedFolder(over?: Partial<Folder>): Folder {
  return {
    id: folderId,
    name: "Reactions",
    ownerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as Folder;
}

function stubRecipientLookup(
  users: ReturnType<typeof createMockRepo>,
  recipient: { id: string; name: string; email: string } | null,
): void {
  const userQb = createMockQueryBuilder();
  userQb.getOne = vi.fn(async () => recipient);
  (users.createQueryBuilder as ReturnType<typeof vi.fn>).mockReturnValueOnce(
    userQb,
  );
}

describe("FoldersService.shareWithUser", () => {
  it("creates a share when the recipient matches by email", async () => {
    const { svc, folders, folderShares, users } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    stubRecipientLookup(users, {
      id: recipientId,
      name: "Alex",
      email: "alex@example.com",
    });
    folderShares.findOne.mockResolvedValueOnce(null);
    folderShares.count.mockResolvedValueOnce(0);
    folderShares.save.mockResolvedValueOnce({ id: "fs-1" } as FolderShare);

    const result = await svc.shareWithUser(
      ownerId,
      folderId,
      "alex@example.com",
    );

    expect(result.shareId).toBe("fs-1");
    expect(result.recipient.id).toBe(recipientId);
    expect(result.alreadyShared).toBe(false);
    expect(folderShares.save).toHaveBeenCalled();
  });

  it("is idempotent when the same pair is already shared", async () => {
    const { svc, folders, folderShares, users } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    stubRecipientLookup(users, {
      id: recipientId,
      name: "Alex",
      email: "alex@example.com",
    });
    folderShares.findOne.mockResolvedValueOnce({
      id: "fs-existing",
    } as FolderShare);

    const result = await svc.shareWithUser(
      ownerId,
      folderId,
      "alex@example.com",
    );

    expect(result.alreadyShared).toBe(true);
    expect(result.shareId).toBe("fs-existing");
    expect(folderShares.save).not.toHaveBeenCalled();
  });

  it("rejects sharing with yourself", async () => {
    const { svc, folders, users } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    stubRecipientLookup(users, {
      id: ownerId,
      name: "Owner",
      email: "owner@example.com",
    });

    await expect(
      svc.shareWithUser(ownerId, folderId, "owner@example.com"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an empty recipient handle", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    await expect(
      svc.shareWithUser(ownerId, folderId, "   "),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws NotFound when the recipient handle doesn't match anyone", async () => {
    const { svc, folders, users } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    stubRecipientLookup(users, null);

    await expect(
      svc.shareWithUser(ownerId, folderId, "ghost@example.com"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects when the folder isn't owned by the caller", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(
      ownedFolder({ ownerId: "u-someone-else" }),
    );
    await expect(
      svc.shareWithUser(ownerId, folderId, "alex@example.com"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks new shares once the per-folder cap is hit", async () => {
    const { svc, folders, folderShares, users } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    stubRecipientLookup(users, {
      id: recipientId,
      name: "Alex",
      email: "alex@example.com",
    });
    folderShares.findOne.mockResolvedValueOnce(null);
    folderShares.count.mockResolvedValueOnce(50);

    await expect(
      svc.shareWithUser(ownerId, folderId, "alex@example.com"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(folderShares.save).not.toHaveBeenCalled();
  });
});

describe("FoldersService.unshare", () => {
  it("deletes the share row when the caller is the owner", async () => {
    const { svc, folders, folderShares } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    await svc.unshare(ownerId, folderId, recipientId);
    expect(folderShares.delete).toHaveBeenCalledWith({
      folderId,
      recipientUserId: recipientId,
    });
  });

  it("rejects non-owners with NotFound (no existence leak)", async () => {
    const { svc, folders, folderShares } = makeSvc();
    folders.findOne.mockResolvedValueOnce(
      ownedFolder({ ownerId: "u-other" }),
    );
    await expect(
      svc.unshare(ownerId, folderId, recipientId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(folderShares.delete).not.toHaveBeenCalled();
  });
});

describe("FoldersService.leaveShare", () => {
  it("lets a recipient leave without an owner check", async () => {
    const { svc, folderShares, folders } = makeSvc();
    // Reset the default findOne mock so we can prove leaveShare never
    // touches the folders repo at all — recipients who've been kicked
    // still need to clear their own row.
    folders.findOne.mockReset();
    await svc.leaveShare(recipientId, folderId);
    expect(folderShares.delete).toHaveBeenCalledWith({
      folderId,
      recipientUserId: recipientId,
    });
    expect(folders.findOne).not.toHaveBeenCalled();
  });
});

describe("FoldersService.findReadable", () => {
  it("returns role=owner for the folder's owner", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    const out = await svc.findReadable(folderId, ownerId);
    expect(out.role).toBe("owner");
  });

  it("returns role=recipient when a share row exists for the viewer", async () => {
    const { svc, folders, folderShares } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    folderShares.findOne.mockResolvedValueOnce({
      id: "fs-1",
    } as FolderShare);
    const out = await svc.findReadable(folderId, recipientId);
    expect(out.role).toBe("recipient");
  });

  it("throws NotFound for everyone else (no existence leak)", async () => {
    const { svc, folders, folderShares } = makeSvc();
    folders.findOne.mockResolvedValueOnce(ownedFolder());
    folderShares.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.findReadable(folderId, "u-stranger"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when the folder doesn't exist", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(null);
    await expect(
      svc.findReadable("f-missing", ownerId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.listShares", () => {
  it("requires ownership before returning the recipient list", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(
      ownedFolder({ ownerId: "u-other" }),
    );
    await expect(
      svc.listShares(ownerId, folderId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.addGif still requires ownership (sharing regression check)", () => {
  it("rejects a recipient trying to add a gif via the share path", async () => {
    const { svc, folders } = makeSvc();
    // Recipient (not owner) tries to mutate a folder they only have
    // read access to. Sharing must NOT escalate to write.
    folders.findOne.mockResolvedValueOnce(
      ownedFolder({ ownerId: "u-other" }),
    );
    await expect(
      svc.addGif(recipientId, folderId, "g-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("FoldersService.adminDelete / adminRemoveGif", () => {
  it("adminDelete bypasses the ownership check", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(
      ownedFolder({ ownerId: "u-someone" }),
    );
    await svc.adminDelete(folderId);
    expect(folders.delete).toHaveBeenCalledWith({ id: folderId });
  });

  it("adminDelete throws NotFound when the folder is missing", async () => {
    const { svc, folders } = makeSvc();
    folders.findOne.mockResolvedValueOnce(null);
    await expect(svc.adminDelete("f-missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("adminRemoveGif removes the join row without an ownership check", async () => {
    const { svc, folderGifs } = makeSvc();
    await svc.adminRemoveGif(folderId, "g-1");
    expect(folderGifs.delete).toHaveBeenCalledWith({
      folderId,
      gifId: "g-1",
    });
  });
});
