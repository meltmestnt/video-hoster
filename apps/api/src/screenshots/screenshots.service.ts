import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThanOrEqual, Repository } from "typeorm";
import {
  ALLOWED_SCREENSHOT_MIME_TYPES,
  type AllowedScreenshotMimeType,
  MAX_SCREENSHOT_BYTES,
  UNAPPROVED_DAILY_SCREENSHOT_LIMIT,
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
  UNVERIFIED_SCREENSHOT_LIMIT,
} from "@repo/shared";
import type { User } from "../users/user.entity";
import {
  Screenshot,
  ScreenshotSource,
  ScreenshotVisibility,
} from "./screenshot.entity";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";

interface CreateUploadArgs {
  ownerId: string;
  ownerStatus: User["status"];
  ownerApproved: boolean;
  title: string;
  mimeType: AllowedScreenshotMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  visibility: ScreenshotVisibility;
  source: ScreenshotSource;
}

interface FinalizeArgs {
  screenshotId: string;
  ownerId: string;
}

const extensionForMime = (mime: string): string => {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "screenshot";

@Injectable()
export class ScreenshotsService {
  private readonly logger = new Logger(ScreenshotsService.name);

  constructor(
    @InjectRepository(Screenshot)
    private readonly screenshots: Repository<Screenshot>,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_SCREENSHOT_BYTES) {
      throw new BadRequestException("Screenshot exceeds 10 MB limit");
    }
    if (
      !(ALLOWED_SCREENSHOT_MIME_TYPES as readonly string[]).includes(
        args.mimeType,
      )
    ) {
      throw new BadRequestException("Unsupported screenshot mime type");
    }

    if (args.ownerStatus !== "verified") {
      const existing = await this.screenshots.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_SCREENSHOT_LIMIT) {
        this.logger.warn(
          `screenshots.createUpload rejected reason=unverified-limit ownerId=${args.ownerId} existing=${existing}`,
        );
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}screenshot`,
        );
      }
    }

    if (!args.ownerApproved) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.screenshots.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_SCREENSHOT_LIMIT) {
        this.logger.warn(
          `screenshots.createUpload rejected reason=unapproved-daily-limit ownerId=${args.ownerId} recent=${recent}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}screenshot`,
        );
      }
    }

    const draft = this.screenshots.create({
      ownerId: args.ownerId,
      title: args.title,
      s3Key: "",
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      width: args.width,
      height: args.height,
      status: "uploading",
      visibility: args.visibility,
      source: args.source,
    });
    const saved = await this.screenshots.save(draft);

    const ext = extensionForMime(args.mimeType);
    const slug = slugify(args.title);
    const s3Key = `screenshots/${saved.id}/${slug}.${ext}`;
    await this.screenshots.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;

    const uploadUrl = await this.s3.presignPut(s3Key, args.mimeType);
    this.logger.log(
      `screenshots.createUpload ownerId=${args.ownerId} size=${args.sizeBytes} mime=${args.mimeType} visibility=${args.visibility} s3Key=${s3Key} screenshotId=${saved.id}`,
    );
    return { screenshotId: saved.id, s3Key, uploadUrl };
  }

  async finalizeUpload(args: FinalizeArgs) {
    const shot = await this.screenshots.findOne({
      where: { id: args.screenshotId },
    });
    if (!shot) throw new NotFoundException("Screenshot not found");
    if (shot.ownerId !== args.ownerId) {
      throw new BadRequestException("Not the owner");
    }
    const head = await this.s3.headObject(shot.s3Key);
    if (!head) {
      throw new BadRequestException("Screenshot object not found in S3");
    }
    if (head.size > MAX_SCREENSHOT_BYTES) {
      await this.s3.deleteObject(shot.s3Key).catch(() => {});
      throw new BadRequestException("Uploaded screenshot exceeds 10 MB limit");
    }
    if (
      head.contentType &&
      !(ALLOWED_SCREENSHOT_MIME_TYPES as readonly string[]).includes(
        head.contentType,
      )
    ) {
      await this.s3.deleteObject(shot.s3Key).catch(() => {});
      throw new BadRequestException(
        `Uploaded object has type "${head.contentType}", not an image`,
      );
    }
    shot.sizeBytes = head.size;
    shot.status = "ready";
    await this.screenshots.save(shot);
    this.logger.log(
      `screenshots.finalizeUpload ok ownerId=${shot.ownerId} screenshotId=${shot.id} size=${shot.sizeBytes}`,
    );
    return { ok: true };
  }

  async deleteScreenshot(id: string, ownerId: string, isAdmin = false) {
    const shot = await this.screenshots.findOne({ where: { id } });
    if (!shot) throw new NotFoundException("Screenshot not found");
    if (!isAdmin && shot.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    let s3CleanupRan = false;
    if (shot.s3Key) {
      s3CleanupRan = true;
      await this.s3.deleteObject(shot.s3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete screenshot S3 object ${shot.s3Key}: ${(err as Error).message}`,
        );
      });
    }
    await this.screenshots.delete({ id });
    const adminPrefix = isAdmin && shot.ownerId !== ownerId ? "[ADMIN] " : "";
    this.logger.log(
      `${adminPrefix}screenshots.deleteScreenshot actorId=${ownerId} screenshotId=${id} ownerId=${shot.ownerId} isAdmin=${isAdmin} s3Cleanup=${s3CleanupRan}`,
    );
    return { ok: true };
  }

  async list({
    cursor,
    limit,
    viewerId,
    ownerId,
  }: {
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    ownerId?: string;
  }) {
    const qb = this.screenshots
      .createQueryBuilder("s")
      .leftJoinAndSelect("s.owner", "owner")
      .where("s.status = :st", { st: "ready" })
      .orderBy("s.createdAt", "DESC")
      .addOrderBy("s.id", "DESC")
      .take(limit + 1);

    if (ownerId) {
      qb.andWhere("s.ownerId = :ownerId", { ownerId });
    }

    if (viewerId) {
      qb.andWhere("(s.visibility = :pub OR s.ownerId = :viewerId)", {
        pub: "public",
        viewerId,
      });
    } else {
      qb.andWhere("s.visibility = :pub", { pub: "public" });
    }

    if (cursor) {
      const c = await this.screenshots.findOne({ where: { id: cursor } });
      if (c) qb.andWhere("s.createdAt < :cAt", { cAt: c.createdAt });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items: await Promise.all(items.map((s) => this.toDto(s))),
      nextCursor,
    };
  }

  async listPublicForSitemap(): Promise<
    Array<{ id: string; createdAt: Date }>
  > {
    return this.screenshots.find({
      select: { id: true, createdAt: true },
      where: { status: "ready", visibility: "public" },
      order: { createdAt: "DESC" },
      take: 5000,
    });
  }

  async byId(id: string, viewerId?: string | null) {
    const shot = await this.screenshots.findOne({
      where: { id },
      relations: ["owner"],
    });
    if (!shot) throw new NotFoundException("Screenshot not found");
    if (shot.visibility === "private" && shot.ownerId !== viewerId) {
      throw new NotFoundException("Screenshot not found");
    }
    return this.toDto(shot);
  }

  /** Atomic +1 on the screenshot's view counter. */
  async incrementView(id: string): Promise<{ viewCount: number }> {
    const row = await this.screenshots.findOne({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundException("Screenshot not found");
    if (row.status !== "ready") return { viewCount: 0 };
    const result = await this.screenshots.manager.query<
      Array<{ viewCount: number }>
    >(
      `UPDATE screenshots SET "viewCount" = "viewCount" + 1
       WHERE id = $1
       RETURNING "viewCount"`,
      [id],
    );
    return { viewCount: result[0]?.viewCount ?? 0 };
  }

  private async toDto(s: Screenshot) {
    const url =
      s.status === "ready"
        ? await this.media.signUrl({ kind: "screenshot", id: s.id })
        : null;
    return {
      id: s.id,
      title: s.title,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      width: s.width,
      height: s.height,
      status: s.status,
      visibility: s.visibility,
      source: s.source,
      createdAt: s.createdAt,
      viewCount: s.viewCount,
      owner: {
        id: s.owner.id,
        name: s.owner.name,
        username: s.owner.username,
        avatarUrl: s.owner.avatarUrl,
      },
      url,
    };
  }
}
