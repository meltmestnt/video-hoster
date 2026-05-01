import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { User } from "../users/user.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { Screenshot } from "../screenshots/screenshot.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { AudioTemplate } from "../audio/audio-template.entity";

export type MediaKind =
  | "video"
  | "thumbnail"
  | "gif"
  | "screenshot"
  | "avatar"
  | "audio";

const KINDS: ReadonlySet<MediaKind> = new Set([
  "video",
  "thumbnail",
  "gif",
  "screenshot",
  "avatar",
  "audio",
]);

export function isMediaKind(s: string): s is MediaKind {
  return KINDS.has(s as MediaKind);
}

// 15 minutes is the smallest window that still lets a typical viewer
// finish a clip without re-issuing — long videos transparently re-fetch
// a fresh URL on the next page load (force-dynamic). Shorter is better
// for wallet protection: a leaked URL stops working in 15 min instead
// of an hour, cutting the share-and-loop attack surface 4×.
const URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly secret: string;
  private readonly publicBase: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Gif) private readonly gifs: Repository<Gif>,
    @InjectRepository(Screenshot)
    private readonly screenshots: Repository<Screenshot>,
    @InjectRepository(Thumbnail)
    private readonly thumbnails: Repository<Thumbnail>,
    @InjectRepository(AudioTemplate)
    private readonly audio: Repository<AudioTemplate>,
  ) {
    // Reuse NEXTAUTH_SECRET so we don't need yet another env var. It's
    // already a long random string and isn't shared with the client.
    this.secret = config.getOrThrow<string>("NEXTAUTH_SECRET");
    // The proxy URLs we hand out need to be absolute — the public base
    // points at the API origin (e.g. `https://api.example.com`).
    this.publicBase = (
      config.get<string>("API_PUBLIC_URL") ??
      `http://localhost:${config.get<string>("PORT") ?? 4000}`
    ).replace(/\/+$/, "");
  }

  /**
   * Build the signed media URL the client should embed in <video>/<img>.
   * Returns null when the entity has no underlying object yet (e.g. an
   * upload that hasn't finalized) so callers can fall back gracefully.
   */
  async signUrl(args: {
    kind: MediaKind;
    id: string;
  }): Promise<string | null> {
    // We only sign URLs for entities that actually exist + have an S3 key.
    // This keeps stale rows (uploading status, missing avatars) from
    // handing out URLs that would 404 on resolution.
    const key = await this.resolveKey(args.kind, args.id);
    if (!key) return null;
    const exp = Date.now() + URL_TTL_MS;
    const sig = this.sign(args.kind, args.id, exp);
    const params = new URLSearchParams({ exp: String(exp), sig });
    return `${this.publicBase}/media/${args.kind}/${args.id}?${params.toString()}`;
  }

  /** Verify a signature; throws on failure. */
  verify(args: {
    kind: MediaKind;
    id: string;
    exp: number;
    sig: string;
  }): void {
    if (!Number.isFinite(args.exp) || args.exp < Date.now()) {
      throw new UnauthorizedException("Media URL expired");
    }
    const expected = Buffer.from(
      this.sign(args.kind, args.id, args.exp),
      "utf8",
    );
    const got = Buffer.from(args.sig, "utf8");
    if (expected.length !== got.length) {
      throw new UnauthorizedException("Invalid media signature");
    }
    if (!timingSafeEqual(expected, got)) {
      throw new UnauthorizedException("Invalid media signature");
    }
  }

  /** Resolve `(kind, id) → S3 key` or null when nothing's stored yet. */
  async resolveKey(kind: MediaKind, id: string): Promise<string | null> {
    switch (kind) {
      case "video": {
        const v = await this.videos.findOne({
          where: { id },
          select: ["id", "s3Key", "status"],
        });
        return v?.status === "ready" && v.s3Key ? v.s3Key : null;
      }
      case "thumbnail": {
        const t = await this.thumbnails.findOne({
          where: { id },
          select: ["id", "s3Key"],
        });
        return t?.s3Key ?? null;
      }
      case "gif": {
        const g = await this.gifs.findOne({
          where: { id },
          select: ["id", "s3Key", "status"],
        });
        return g?.status === "ready" && g.s3Key ? g.s3Key : null;
      }
      case "screenshot": {
        const s = await this.screenshots.findOne({
          where: { id },
          select: ["id", "s3Key", "status"],
        });
        return s?.status === "ready" && s.s3Key ? s.s3Key : null;
      }
      case "avatar": {
        const u = await this.users.findOne({
          where: { id },
          select: ["id", "avatarS3Key"],
        });
        return u?.avatarS3Key ?? null;
      }
      case "audio": {
        const a = await this.audio.findOne({
          where: { id },
          select: ["id", "s3Key"],
        });
        return a?.s3Key ?? null;
      }
    }
  }

  /**
   * Convenience: resolve the underlying S3 key for a verified request.
   * Throws NotFound when the row exists but has no object yet (the URL
   * was signed for it but it's since been replaced/cleared).
   */
  async resolveKeyOrThrow(kind: MediaKind, id: string): Promise<string> {
    const key = await this.resolveKey(kind, id);
    if (!key) throw new NotFoundException("Media not found");
    return key;
  }

  private sign(kind: MediaKind, id: string, exp: number): string {
    return createHmac("sha256", this.secret)
      .update(`${kind}|${id}|${exp}`)
      .digest("hex");
  }
}
