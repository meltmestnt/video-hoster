import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Repository } from "typeorm";
import {
  MAX_GIF_BYTES,
  MAX_GIF_DURATION_SECONDS,
  UNAPPROVED_DAILY_GIF_LIMIT,
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_GIF_LIMIT,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
} from "@repo/shared";
import { GifsService } from "./gifs.service";
import type { Gif } from "./gif.entity";
import type { User } from "../users/user.entity";
import { createMockRepo } from "../../test/mock-repo";

function makeSvc() {
  const gifs = createMockRepo<Gif>();
  const tags = { ensureTags: vi.fn(async () => []) };
  const s3 = {
    presignPut: vi.fn(async () => "https://signed/put"),
    uploadBuffer: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
    headObject: vi.fn(),
    readObjectHead: vi.fn(),
  };
  const reactions = {
    gifCountsFor: vi.fn(async () => new Map()),
    viewerGifReactionsFor: vi.fn(async () => new Map()),
  };
  const notifications = {
    onGifUploaded: vi.fn(async () => undefined),
  };
  const media = { signUrl: vi.fn(async () => "https://signed") };
  const transcoder = {
    compressGifToSd: vi.fn(),
    gifToMp4: vi.fn(),
    gifFirstFrameJpeg: vi.fn(),
  };
  const svc = new GifsService(
    gifs as unknown as Repository<Gif>,
    tags as never,
    s3 as never,
    reactions as never,
    notifications as never,
    media as never,
    transcoder as never,
  );
  return { svc, gifs, s3, transcoder, notifications };
}

const baseArgs = {
  ownerId: "u-1",
  ownerStatus: "verified" as User["status"],
  ownerApproved: true,
  title: "Loop",
  description: "",
  sizeBytes: 1_000_000,
  durationSeconds: 5,
  tagNames: [],
  visibility: "public" as const,
};

describe("GifsService.createUpload — quota gates", () => {
  it("rejects sizeBytes over MAX_GIF_BYTES", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createUpload({ ...baseArgs, sizeBytes: MAX_GIF_BYTES + 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects durationSeconds well past the cap", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createUpload({
        ...baseArgs,
        durationSeconds: MAX_GIF_DURATION_SECONDS + 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks an unverified account once it has UNVERIFIED_GIF_LIMIT GIFs", async () => {
    const { svc, gifs } = makeSvc();
    gifs.count.mockResolvedValueOnce(UNVERIFIED_GIF_LIMIT);
    let thrown: unknown;
    try {
      await svc.createUpload({ ...baseArgs, ownerStatus: "unverified" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toBe(
      `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
    );
  });

  it("blocks an unapproved-but-verified user once they hit UNAPPROVED_DAILY_GIF_LIMIT", async () => {
    const { svc, gifs } = makeSvc();
    // First count = unverified gate (we're verified; service still calls it
    // for the gate even though we're past it, but we ARE verified so it
    // skips that count entirely). Second count = unapproved daily.
    gifs.count.mockResolvedValueOnce(UNAPPROVED_DAILY_GIF_LIMIT);
    let thrown: unknown;
    try {
      await svc.createUpload({ ...baseArgs, ownerApproved: false });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toBe(
      `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
    );
  });

  it("blocks when an in-flight draft is still inside the stale window", async () => {
    const { svc, gifs } = makeSvc();
    gifs.findOne.mockResolvedValueOnce({
      id: "g-busy",
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    } as Gif);
    await expect(svc.createUpload(baseArgs)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("ignores stale drafts older than the staleness window", async () => {
    const { svc, gifs } = makeSvc();
    gifs.findOne.mockResolvedValueOnce({
      id: "g-old",
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
    } as Gif);
    gifs.save.mockResolvedValueOnce({ id: "g-new", s3Key: "" } as Gif);
    await svc.createUpload(baseArgs);
    expect(gifs.save).toHaveBeenCalled();
  });
});

describe("GifsService.createUpload — happy path", () => {
  it("returns gifId, s3Key and uploadUrl", async () => {
    const { svc, gifs, s3 } = makeSvc();
    gifs.findOne.mockResolvedValueOnce(null);
    gifs.save.mockResolvedValueOnce({ id: "g-new", s3Key: "" } as Gif);
    (s3.presignPut as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (key: string) => `https://signed/${key}`,
    );
    const out = await svc.createUpload({ ...baseArgs, title: "My Loop" });
    expect(out.gifId).toBe("g-new");
    expect(out.s3Key).toBe("gifs/g-new/my-loop.gif");
    expect(out.uploadUrl).toContain("my-loop.gif");
    expect(s3.presignPut).toHaveBeenCalledWith(
      "gifs/g-new/my-loop.gif",
      "image/gif",
    );
  });
});

describe("GifsService.createFromBuffer (Telegram path)", () => {
  // Build a tiny "GIF" buffer: GIF89a magic + padding so looksLikeGif
  // returns true and we can exercise the rest of the flow.
  function fakeGifBuffer(extra = 0): Buffer {
    const head = Buffer.from("GIF89a");
    return Buffer.concat([head, Buffer.alloc(extra)]);
  }

  it("rejects buffers larger than MAX_GIF_BYTES", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createFromBuffer({
        ownerId: "u-1",
        ownerStatus: "verified",
        ownerApproved: true,
        title: "X",
        buffer: Buffer.alloc(MAX_GIF_BYTES + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects buffers without the GIF magic header", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createFromBuffer({
        ownerId: "u-1",
        ownerStatus: "verified",
        ownerApproved: true,
        title: "X",
        buffer: Buffer.from("definitely not a gif"),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks an unverified account at the cap before uploading", async () => {
    const { svc, gifs, s3 } = makeSvc();
    gifs.count.mockResolvedValueOnce(UNVERIFIED_GIF_LIMIT);
    await expect(
      svc.createFromBuffer({
        ownerId: "u-1",
        ownerStatus: "unverified",
        ownerApproved: true,
        title: "X",
        buffer: fakeGifBuffer(100),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.uploadBuffer).not.toHaveBeenCalled();
  });

  it("uploads + saves with source=telegram on the happy path", async () => {
    const { svc, gifs, s3, transcoder, notifications } = makeSvc();
    gifs.count.mockResolvedValue(0);
    transcoder.compressGifToSd.mockResolvedValueOnce(Buffer.alloc(0));
    gifs.save
      .mockResolvedValueOnce({
        id: "g-new",
        s3Key: "",
        ownerId: "u-1",
      } as Gif)
      .mockResolvedValueOnce({} as Gif);
    await svc.createFromBuffer({
      ownerId: "u-1",
      ownerStatus: "verified",
      ownerApproved: true,
      title: "Telegram GIF",
      buffer: fakeGifBuffer(500),
    });
    // Source field should be set on the create() payload.
    const createCall = gifs.create.mock.calls[0][0] as { source?: string };
    expect(createCall.source).toBe("telegram");
    expect(s3.uploadBuffer).toHaveBeenCalled();
    expect(notifications.onGifUploaded).toHaveBeenCalledWith("g-new", "u-1");
  });

  it("keeps the original buffer when transcoder.compressGifToSd grows or fails", async () => {
    const { svc, gifs, s3, transcoder } = makeSvc();
    gifs.count.mockResolvedValue(0);
    // Compression returns a LARGER buffer — service should ignore it.
    transcoder.compressGifToSd.mockResolvedValueOnce(Buffer.alloc(99_999));
    gifs.save
      .mockResolvedValueOnce({ id: "g-1", s3Key: "" } as Gif)
      .mockResolvedValueOnce({} as Gif);
    const original = fakeGifBuffer(500);
    await svc.createFromBuffer({
      ownerId: "u-1",
      ownerStatus: "verified",
      ownerApproved: true,
      title: "X",
      buffer: original,
    });
    const callArgs = s3.uploadBuffer.mock.calls[0] as unknown as [
      string,
      Buffer,
      string,
    ];
    // Stored buffer length should match the original, not the inflated one.
    expect(callArgs[1].length).toBe(original.length);
  });

  it("falls back to the original buffer when compression throws", async () => {
    const { svc, gifs, s3, transcoder } = makeSvc();
    gifs.count.mockResolvedValue(0);
    transcoder.compressGifToSd.mockRejectedValueOnce(new Error("ffmpeg blew up"));
    gifs.save
      .mockResolvedValueOnce({ id: "g-1", s3Key: "" } as Gif)
      .mockResolvedValueOnce({} as Gif);
    const original = fakeGifBuffer(500);
    await svc.createFromBuffer({
      ownerId: "u-1",
      ownerStatus: "verified",
      ownerApproved: true,
      title: "X",
      buffer: original,
    });
    expect(s3.uploadBuffer).toHaveBeenCalled();
    const callArgs = s3.uploadBuffer.mock.calls[0] as unknown as [
      string,
      Buffer,
      string,
    ];
    expect(callArgs[1].length).toBe(original.length);
  });
});
