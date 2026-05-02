import { describe, expect, it, vi } from "vitest";
import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import type { Repository } from "typeorm";
import {
  DAILY_VIDEO_BYTES_LIMIT,
  DAILY_VIDEO_UPLOAD_LIMIT,
  MAX_VIDEO_BYTES,
  UNAPPROVED_DAILY_VIDEO_LIMIT,
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_VIDEO_LIMIT,
} from "@repo/shared";
import { VideosService } from "./videos.service";
import type { Video } from "./video.entity";
import type { Thumbnail } from "../thumbnails/thumbnail.entity";
import type { User } from "../users/user.entity";
import { createMockRepo } from "../../test/mock-repo";

function makeSvc() {
  const videos = createMockRepo<Video>();
  const thumbnails = createMockRepo<Thumbnail>();
  const users = createMockRepo<User>();
  const tags = { ensureTags: vi.fn(async () => []) };
  const s3 = {
    presignPut: vi.fn(async (_k: string, _m: string) => "https://signed/put"),
    headObject: vi.fn(),
    deleteObject: vi.fn(async () => undefined),
    readObjectHead: vi.fn(),
    uploadBuffer: vi.fn(async () => undefined),
  };
  const transcoder = {
    compressTo480p: vi.fn(),
    generateThumbnail: vi.fn(async () => null),
  };
  const reactions = {
    countsFor: vi.fn(async () => new Map()),
    viewerReactionsFor: vi.fn(async () => new Map()),
  };
  const favorites = {
    favoritedSet: vi.fn(async () => new Set<string>()),
  };
  const notifications = {
    onVideoUploaded: vi.fn(async () => undefined),
  };
  const audio = {
    tracksForVideos: vi.fn(async () => new Map()),
  };
  const mail = {
    notifyAdminsOfVideoUpload: vi.fn(async () => undefined),
  };
  const media = { signUrl: vi.fn(async () => "https://signed") };

  // Cast to the service's actual constructor types via `unknown` so we
  // don't have to mirror the full Repository<T> / service surfaces in
  // mocks. The runtime calls only touch what we've stubbed.
  const svc = new VideosService(
    videos as unknown as Repository<Video>,
    thumbnails as unknown as Repository<Thumbnail>,
    users as unknown as Repository<User>,
    tags as never,
    s3 as never,
    transcoder as never,
    reactions as never,
    favorites as never,
    notifications as never,
    audio as never,
    mail as never,
    media as never,
  );
  return {
    svc,
    videos,
    thumbnails,
    users,
    tags,
    s3,
    transcoder,
    notifications,
    media,
  };
}

const baseArgs = {
  ownerId: "u-1",
  ownerStatus: "verified" as User["status"],
  ownerApproved: true,
  title: "Title",
  description: "",
  mimeType: "video/mp4" as const,
  sizeBytes: 1_000_000,
  tagNames: [],
  visibility: "public" as const,
  downloadPolicy: "full" as const,
};

describe("VideosService.createUpload — quota gates", () => {
  it("rejects sizeBytes over MAX_VIDEO_BYTES outright", async () => {
    const { svc } = makeSvc();
    await expect(
      svc.createUpload({ ...baseArgs, sizeBytes: MAX_VIDEO_BYTES + 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks an unverified account once it has UNVERIFIED_VIDEO_LIMIT ready uploads", async () => {
    const { svc, videos } = makeSvc();
    videos.count.mockResolvedValueOnce(UNVERIFIED_VIDEO_LIMIT);
    let thrown: unknown;
    try {
      await svc.createUpload({ ...baseArgs, ownerStatus: "unverified" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toBe(
      `${UNVERIFIED_LIMIT_ERROR_PREFIX}video`,
    );
  });

  it("counts only ready rows toward the unverified cap (drafts don't lock the user)", async () => {
    const { svc, videos } = makeSvc();
    videos.count.mockImplementation(async (args: unknown) => {
      // The service should query for status: "ready" — assert that the
      // call site is correct rather than just behavior.
      const where = (args as { where?: { status?: string } }).where;
      expect(where?.status).toBe("ready");
      return 0; // pretend zero ready rows so it passes the gate
    });
    videos.find.mockResolvedValueOnce([]); // recent rolling-window query
    videos.findOne.mockResolvedValueOnce(null); // no in-flight
    videos.save.mockResolvedValueOnce({
      id: "v-1",
      s3Key: "",
    } as Video);
    await svc.createUpload({ ...baseArgs, ownerStatus: "unverified" });
    expect(videos.save).toHaveBeenCalled();
  });

  it("blocks an unapproved-but-verified user once they hit the daily count cap", async () => {
    const { svc, videos } = makeSvc();
    videos.count.mockResolvedValueOnce(0); // unverified gate (we're verified, so n/a but called)
    videos.find.mockResolvedValueOnce(
      Array.from({ length: UNAPPROVED_DAILY_VIDEO_LIMIT }, (_, i) => ({
        id: `v-${i}`,
        sizeBytes: "100000",
      })) as unknown as Video[],
    );
    let thrown: unknown;
    try {
      await svc.createUpload({ ...baseArgs, ownerApproved: false });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toBe(
      `${UNAPPROVED_LIMIT_ERROR_PREFIX}video`,
    );
  });

  it("blocks once recent rows hit DAILY_VIDEO_UPLOAD_LIMIT", async () => {
    const { svc, videos } = makeSvc();
    videos.find.mockResolvedValueOnce(
      Array.from({ length: DAILY_VIDEO_UPLOAD_LIMIT }, (_, i) => ({
        id: `v-${i}`,
        sizeBytes: "100",
      })) as unknown as Video[],
    );
    let thrown: unknown;
    try {
      await svc.createUpload(baseArgs);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toMatch(/Daily upload limit reached/);
  });

  it("blocks when the new file would push usedBytes past DAILY_VIDEO_BYTES_LIMIT", async () => {
    const { svc, videos } = makeSvc();
    // One existing row consuming most of the daily quota.
    videos.find.mockResolvedValueOnce([
      { id: "v-prev", sizeBytes: String(DAILY_VIDEO_BYTES_LIMIT - 100) },
    ] as unknown as Video[]);
    let thrown: unknown;
    try {
      await svc.createUpload({ ...baseArgs, sizeBytes: 1024 });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as Error).message).toMatch(/Daily upload size limit/);
  });

  it("blocks when an in-flight draft is still inside the stale-after window", async () => {
    const { svc, videos } = makeSvc();
    videos.find.mockResolvedValueOnce([]);
    videos.findOne.mockResolvedValueOnce({
      id: "v-busy",
      // 10 minutes old — inside the 30-minute stale window
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    } as Video);
    await expect(svc.createUpload(baseArgs)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("ignores stale 'uploading' drafts older than the staleness threshold", async () => {
    const { svc, videos } = makeSvc();
    videos.find.mockResolvedValueOnce([]);
    videos.findOne.mockResolvedValueOnce({
      id: "v-old",
      // 35 minutes ago — past the 30-minute staleness window
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
    } as Video);
    videos.save.mockResolvedValueOnce({ id: "v-new", s3Key: "" } as Video);
    await svc.createUpload(baseArgs);
    expect(videos.save).toHaveBeenCalled();
  });
});

describe("VideosService.createUpload — happy path", () => {
  it("returns the video id, s3 key, and presigned URLs on success", async () => {
    const { svc, videos, s3 } = makeSvc();
    videos.find.mockResolvedValueOnce([]);
    videos.findOne.mockResolvedValueOnce(null);
    videos.save.mockResolvedValueOnce({
      id: "v-new",
      title: "Title",
      s3Key: "",
    } as Video);
    s3.presignPut.mockImplementation(
      async (key: string) => `https://signed/${key}`,
    );

    const out = await svc.createUpload({ ...baseArgs, title: "My Title" });
    expect(out.videoId).toBe("v-new");
    expect(out.s3Key).toMatch(/^videos\/v-new\/source-my-title\.mp4$/);
    expect(out.uploadUrl).toContain("source-my-title.mp4");
    expect(out.thumbnailS3Key).toMatch(/^videos\/v-new\/thumb-/);
    expect(out.thumbnailUploadUrl).toContain("thumb-");
  });

  it("uses the right extension for each supported MIME", async () => {
    type Mime =
      | "video/mp4"
      | "video/quicktime"
      | "video/webm"
      | "video/x-matroska";
    const cases: Array<[Mime, string]> = [
      ["video/mp4", "mp4"],
      ["video/quicktime", "mov"],
      ["video/webm", "webm"],
      ["video/x-matroska", "mkv"],
    ];
    for (const [mime, ext] of cases) {
      const { svc, videos } = makeSvc();
      videos.find.mockResolvedValueOnce([]);
      videos.findOne.mockResolvedValueOnce(null);
      videos.save.mockResolvedValueOnce({
        id: "v-x",
        s3Key: "",
      } as Video);
      const out = await svc.createUpload({ ...baseArgs, mimeType: mime });
      expect(out.s3Key).toMatch(new RegExp(`\\.${ext}$`));
    }
  });
});

describe("VideosService.getUploadQuota", () => {
  it("returns counts and used bytes from the rolling window", async () => {
    const { svc, videos } = makeSvc();
    videos.find.mockResolvedValueOnce([
      { id: "v-1", sizeBytes: "1000" },
      { id: "v-2", sizeBytes: "2000" },
    ] as unknown as Video[]);
    expect(await svc.getUploadQuota("u-1")).toEqual({
      count: 2,
      usedBytes: 3000,
      videoLimit: DAILY_VIDEO_UPLOAD_LIMIT,
      bytesLimit: DAILY_VIDEO_BYTES_LIMIT,
    });
  });
});
