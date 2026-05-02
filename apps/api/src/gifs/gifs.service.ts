import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository, SelectQueryBuilder } from "typeorm";
import {
  MAX_GIF_BYTES,
  MAX_GIF_DURATION_SECONDS,
  UNAPPROVED_DAILY_GIF_LIMIT,
  UNAPPROVED_LIMIT_ERROR_PREFIX,
  UNAPPROVED_MAX_GIF_BYTES,
  UNAPPROVED_MAX_GIF_MB,
  UNAPPROVED_SIZE_ERROR_PREFIX,
  UNVERIFIED_GIF_LIMIT,
  UNVERIFIED_LIMIT_ERROR_PREFIX,
  type VideoSort,
} from "@repo/shared";
import { MoreThanOrEqual } from "typeorm";
import type { User } from "../users/user.entity";
import { Gif, GifVisibility } from "./gif.entity";
import { TagsService } from "../tags/tags.service";
import { S3Service } from "../s3/s3.service";
import { ReactionsService } from "../reactions/reactions.service";
import type { ReactionType } from "../reactions/reaction.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { MediaService } from "../media/media.service";
import { TranscoderService } from "../transcoder/transcoder.service";
import { looksLikeGif } from "../s3/file-signatures";
import {
  fetchRemoteMedia,
  RemoteFetchError,
} from "../s3/url-fetcher";


interface CreateUploadArgs {
  ownerId: string;
  ownerStatus: User["status"];
  ownerApproved: boolean;
  title: string;
  description: string;
  sizeBytes: number;
  durationSeconds: number;
  tagNames: string[];
  visibility: GifVisibility;
}

interface FinalizeArgs {
  gifId: string;
  ownerId: string;
}

interface UploadFromUrlArgs {
  ownerId: string;
  ownerStatus: User["status"];
  ownerApproved: boolean;
  url: string;
  title: string;
  description: string;
  tagNames: string[];
  visibility: GifVisibility;
}

const URL_FETCH_TIMEOUT_MS = 60_000;

// Walk a GIF buffer and sum delays declared in Graphic Control
// Extension blocks (0x21 0xF9 0x04 ... delay-low delay-high). Mirrors
// the in-browser parser in apps/web/components/GifUploadDialog.tsx so
// URL-ingested GIFs face the same duration cap as file-uploaded ones.
function gifDurationSeconds(bytes: Buffer): number {
  let total = 0;
  let frames = 0;
  for (let i = 0; i + 7 < bytes.length; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
      const raw = bytes[i + 4] | (bytes[i + 5] << 8);
      // Encoders frequently emit delay=0 expecting renderers to use a
      // sane default (~100ms). Browsers do; match their behavior so a
      // 200-frame "delay=0" loop doesn't slip past the duration cap.
      total += raw <= 1 ? 10 : raw;
      frames++;
      i += 7;
    }
  }
  if (frames === 0) return 0;
  return total / 100;
}

function toUserFacingFetchError(err: RemoteFetchError): string {
  switch (err.code) {
    case "INVALID_URL":
      return "That URL doesn't look valid.";
    case "DISALLOWED_PROTOCOL":
      return "Only https URLs are allowed.";
    case "PRIVATE_ADDRESS":
      return "That URL points to a non-public address.";
    case "DNS_FAILURE":
      return "Couldn't resolve that hostname.";
    case "TOO_MANY_REDIRECTS":
      return "Too many redirects from that URL.";
    case "REDIRECT_LOCATION_INVALID":
      return "Redirect from that URL was rejected.";
    case "TOO_LARGE":
      return "That file is larger than the GIF upload limit.";
    case "TIMEOUT":
      return "Fetching that URL took too long.";
    case "HTTP_STATUS":
      return "The source returned an error response.";
    case "NETWORK":
    default:
      return "Couldn't fetch that URL.";
  }
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "gif";

@Injectable()
export class GifsService {
  private readonly logger = new Logger(GifsService.name);

  constructor(
    @InjectRepository(Gif) private readonly gifs: Repository<Gif>,
    private readonly tagsService: TagsService,
    private readonly s3: S3Service,
    private readonly reactionsService: ReactionsService,
    private readonly notificationsService: NotificationsService,
    private readonly media: MediaService,
    private readonly transcoder: TranscoderService,
  ) {}

  // In-process dedupe so two near-simultaneous inline queries for the
  // same un-backfilled GIF don't both kick off the ffmpeg job. Survives
  // only the lifetime of one Nest process — that's fine: in the worst
  // case two replicas race and the second upload wins; both end with a
  // valid mp4 in S3.
  private readonly mp4InFlight = new Set<string>();

  async createUpload(args: CreateUploadArgs) {
    if (args.sizeBytes > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (args.durationSeconds > 20.5) {
      throw new BadRequestException("GIF exceeds 20s duration limit");
    }

    if (args.ownerStatus !== "verified") {
      const existing = await this.gifs.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_GIF_LIMIT) {
        this.logger.warn(
          `gifs.createUpload rejected reason=unverified-limit ownerId=${args.ownerId} existing=${existing}`,
        );
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    // Verified-but-unapproved daily cap. Drafts count too so a stuck
    // "uploading" row from a failed earlier attempt doesn't permanently
    // bypass the limit.
    if (!args.ownerApproved) {
      // Per-file size ceiling for unapproved accounts — keeps a fresh
      // user from burning S3 wallet on huge gifs before review. Checked
      // before the count query so a too-big upload fails fast without
      // counting against quota.
      if (args.sizeBytes > UNAPPROVED_MAX_GIF_BYTES) {
        this.logger.warn(
          `gifs.createUpload rejected reason=unapproved-size ownerId=${args.ownerId} sizeBytes=${args.sizeBytes}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_SIZE_ERROR_PREFIX}gif`,
        );
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.gifs.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_GIF_LIMIT) {
        this.logger.warn(
          `gifs.createUpload rejected reason=unapproved-daily-limit ownerId=${args.ownerId} recent=${recent}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    // One in-flight upload per user. A draft is considered abandoned once
    // the presigned PUT TTL has expired, so older "uploading" rows don't
    // block.
    const STALE_AFTER_MS = 30 * 60 * 1000;
    const inFlight = await this.gifs.findOne({
      where: { ownerId: args.ownerId, status: "uploading" },
      order: { createdAt: "DESC" },
    });
    if (
      inFlight &&
      Date.now() - inFlight.createdAt.getTime() < STALE_AFTER_MS
    ) {
      throw new ConflictException("You already have a gif upload in progress");
    }

    const tags = await this.tagsService.ensureTags(args.tagNames);
    const slug = slugify(args.title);

    const draft = this.gifs.create({
      ownerId: args.ownerId,
      title: args.title,
      description: args.description,
      s3Key: "",
      sizeBytes: args.sizeBytes,
      durationSeconds: args.durationSeconds,
      status: "uploading",
      visibility: args.visibility,
      tags,
    });
    const saved = await this.gifs.save(draft);

    const s3Key = `gifs/${saved.id}/${slug}.gif`;
    await this.gifs.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;

    const uploadUrl = await this.s3.presignPut(s3Key, "image/gif");
    this.logger.log(
      `gifs.createUpload ownerId=${args.ownerId} size=${args.sizeBytes} mime=image/gif visibility=${args.visibility} s3Key=${s3Key} gifId=${saved.id}`,
    );
    return { gifId: saved.id, s3Key, uploadUrl };
  }

  async finalizeUpload(args: FinalizeArgs) {
    const gif = await this.gifs.findOne({ where: { id: args.gifId } });
    if (!gif) throw new NotFoundException("Gif not found");
    if (gif.ownerId !== args.ownerId) {
      throw new BadRequestException("Not the owner");
    }
    const head = await this.s3.headObject(gif.s3Key);
    if (!head) {
      throw new BadRequestException("Gif object not found in S3");
    }
    if (head.size > MAX_GIF_BYTES) {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException("Uploaded gif exceeds 20 MB limit");
    }
    // Server-side type check: presigned PUT was for image/gif, but a
    // client could PUT a different MIME. Reject so the GIF page doesn't
    // end up serving e.g. a video or PDF.
    if (head.contentType && head.contentType !== "image/gif") {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException(
        `Uploaded object has type "${head.contentType}", not a GIF`,
      );
    }
    // Magic-byte check is the source of truth — the Content-Type metadata
    // was set client-side and can be lied about. Refuse anything whose
    // actual bytes don't begin with the GIF87a/89a header.
    const head6 = await this.s3.readObjectHead(gif.s3Key, 16);
    if (!head6 || !looksLikeGif(head6)) {
      await this.s3.deleteObject(gif.s3Key).catch(() => {});
      throw new BadRequestException(
        "Uploaded file does not look like a real GIF",
      );
    }

    // Re-encode every uploaded GIF to SD via the transcoder's two-pass
    // palette pipeline (≤ 480px wide, 15 fps). Replace the S3 object in
    // place when the result is smaller; if compression makes the file
    // bigger (rare, mostly for already-tiny GIFs) we keep the original.
    // Failures are non-fatal — the GIF stays usable as uploaded.
    let finalSize = head.size;
    try {
      const compressed = await this.transcoder.compressGifToSd(gif.s3Key);
      if (compressed.length > 0 && compressed.length < head.size) {
        await this.s3.uploadBuffer(gif.s3Key, compressed, "image/gif");
        finalSize = compressed.length;
        this.logger.log(
          `gifs.finalizeUpload compressed gifId=${gif.id} ${head.size}→${compressed.length} bytes (${Math.round(
            (1 - compressed.length / head.size) * 100,
          )}% saved)`,
        );
      } else {
        this.logger.log(
          `gifs.finalizeUpload skipped compression gifId=${gif.id} original=${head.size} compressed=${compressed.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `gifs.finalizeUpload compression failed gifId=${gif.id}: ${(err as Error).message}; keeping original`,
      );
    }

    gif.sizeBytes = finalSize;
    gif.status = "ready";
    await this.gifs.save(gif);
    this.logger.log(
      `gifs.finalizeUpload ok ownerId=${gif.ownerId} gifId=${gif.id} size=${gif.sizeBytes}`,
    );
    // Fire-and-forget MP4 transcode for the Telegram inline-query path.
    // We don't block finalize on it: the GIF is already usable on the
    // website, and the inline handler retries on demand for rows where
    // the mp4 isn't there yet.
    void this.ensureMp4(gif.id).catch((err) =>
      this.logger.warn(
        `gifs.ensureMp4 failed gifId=${gif.id}: ${(err as Error).message}`,
      ),
    );
    if (gif.visibility === "public") {
      await this.notificationsService
        .onGifUploaded(gif.id, gif.ownerId)
        .catch((err) =>
          this.logger.warn(
            `Failed to notify subscribers of GIF upload ${gif.id}: ${(err as Error).message}`,
          ),
        );
    }
    return { ok: true };
  }

  /**
   * Server-side ingest from a remote URL. Mirrors createUpload +
   * finalizeUpload in one shot — same per-account quotas, same magic-
   * byte gate, same duration cap, same compression and notification
   * behavior — except the bytes flow through our process instead of
   * through a presigned PUT.
   *
   * SSRF safety lives in {@link fetchRemoteMedia}: only public IPs,
   * https-only in production, hard byte cap during streaming, redirect
   * re-validation.
   */
  async uploadFromUrl(args: UploadFromUrlArgs): Promise<{ gifId: string }> {
    if (args.ownerStatus !== "verified") {
      const existing = await this.gifs.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_GIF_LIMIT) {
        this.logger.warn(
          `gifs.uploadFromUrl rejected reason=unverified-limit ownerId=${args.ownerId} existing=${existing}`,
        );
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }
    if (!args.ownerApproved) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.gifs.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_GIF_LIMIT) {
        this.logger.warn(
          `gifs.uploadFromUrl rejected reason=unapproved-daily-limit ownerId=${args.ownerId} recent=${recent}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    const STALE_AFTER_MS = 30 * 60 * 1000;
    const inFlight = await this.gifs.findOne({
      where: { ownerId: args.ownerId, status: "uploading" },
      order: { createdAt: "DESC" },
    });
    if (
      inFlight &&
      Date.now() - inFlight.createdAt.getTime() < STALE_AFTER_MS
    ) {
      throw new ConflictException(
        "You already have a gif upload in progress",
      );
    }

    // Tighten the byte cap for unapproved accounts so the fetcher
    // aborts early rather than streaming a 20 MB gif we'd reject after.
    const fetchMaxBytes = args.ownerApproved
      ? MAX_GIF_BYTES
      : UNAPPROVED_MAX_GIF_BYTES;
    let fetched;
    try {
      fetched = await fetchRemoteMedia(args.url, {
        maxBytes: fetchMaxBytes,
        timeoutMs: URL_FETCH_TIMEOUT_MS,
      });
    } catch (err) {
      // Re-map TOO_LARGE on the unapproved path to the size-error prefix
      // so the client can surface "exceeds 5 MB cap" instead of a generic
      // fetch error — same UX as a direct upload that's too big.
      if (
        !args.ownerApproved &&
        err instanceof RemoteFetchError &&
        err.code === "TOO_LARGE"
      ) {
        this.logger.warn(
          `gifs.uploadFromUrl rejected reason=unapproved-size ownerId=${args.ownerId} url=${args.url}`,
        );
        throw new BadRequestException(
          `${UNAPPROVED_SIZE_ERROR_PREFIX}gif`,
        );
      }
      if (err instanceof RemoteFetchError) {
        this.logger.warn(
          `gifs.uploadFromUrl fetch failed ownerId=${args.ownerId} url=${args.url} code=${err.code}: ${err.message}`,
        );
        throw new BadRequestException(toUserFacingFetchError(err));
      }
      throw err;
    }

    if (fetched.buffer.length > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (!looksLikeGif(fetched.buffer.subarray(0, 16))) {
      this.logger.warn(
        `gifs.uploadFromUrl rejected reason=not-a-gif ownerId=${args.ownerId} url=${args.url} contentType=${fetched.contentType}`,
      );
      throw new BadRequestException(
        "URL does not point to a real GIF (.gif).",
      );
    }
    const duration = gifDurationSeconds(fetched.buffer);
    if (duration > MAX_GIF_DURATION_SECONDS + 0.5) {
      throw new BadRequestException(
        `GIF exceeds ${MAX_GIF_DURATION_SECONDS}s duration limit`,
      );
    }

    // Same SD recompression as the regular upload path. Skip when the
    // result is bigger than the source — for tiny GIFs, the palette
    // pipeline can produce a larger file.
    let storedBuffer = fetched.buffer;
    try {
      const compressed = await this.transcoder.compressGifToSd(fetched.buffer);
      if (compressed.length > 0 && compressed.length < fetched.buffer.length) {
        storedBuffer = compressed;
      }
    } catch (err) {
      this.logger.warn(
        `gifs.uploadFromUrl compression failed ownerId=${args.ownerId}: ${(err as Error).message}; keeping original`,
      );
    }

    const tags = await this.tagsService.ensureTags(args.tagNames);
    const slug = slugify(args.title);
    const draft = this.gifs.create({
      ownerId: args.ownerId,
      title: args.title,
      description: args.description,
      s3Key: "",
      sizeBytes: storedBuffer.length,
      // Cap to the schema limit so a marginal-overhead measurement
      // (raw + 0.4s) doesn't fail the not-null DB constraint.
      durationSeconds: Math.max(
        0.1,
        Math.min(duration || 0.1, MAX_GIF_DURATION_SECONDS),
      ),
      status: "uploading",
      visibility: args.visibility,
      tags,
    });
    const saved = await this.gifs.save(draft);
    const s3Key = `gifs/${saved.id}/${slug}.gif`;
    try {
      await this.s3.uploadBuffer(s3Key, storedBuffer, "image/gif");
    } catch (err) {
      this.logger.error(
        `gifs.uploadFromUrl S3 upload failed gifId=${saved.id}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        "Server failed to store the fetched file. Please try again.",
      );
    }
    saved.s3Key = s3Key;
    saved.status = "ready";
    await this.gifs.save(saved);
    this.logger.log(
      `gifs.uploadFromUrl ok ownerId=${args.ownerId} gifId=${saved.id} bytes=${storedBuffer.length} src=${args.url}`,
    );

    // Same fire-and-forget MP4 transcode + subscriber notification as
    // the website upload path so URL-ingested GIFs are also pickable
    // by the Telegram inline bot and trigger follower pings.
    void this.ensureMp4(saved.id).catch((err) =>
      this.logger.warn(
        `gifs.ensureMp4 failed gifId=${saved.id}: ${(err as Error).message}`,
      ),
    );
    if (saved.visibility === "public") {
      await this.notificationsService
        .onGifUploaded(saved.id, saved.ownerId)
        .catch((err) =>
          this.logger.warn(
            `Failed to notify subscribers of GIF upload ${saved.id}: ${(err as Error).message}`,
          ),
        );
    }

    return { gifId: saved.id };
  }

  /**
   * Server-side path used by the Telegram bot. Skips the
   * presign/finalize roundtrip because the bytes are already in process
   * memory — we still run the same size, magic-byte, and per-account-tier
   * limit checks the regular flow does, and the row lands in `ready` with
   * the same notifications fired.
   */
  async createFromBuffer(args: {
    ownerId: string;
    ownerStatus: User["status"];
    ownerApproved: boolean;
    title: string;
    buffer: Buffer;
    tagNames?: string[];
  }): Promise<Gif> {
    if (args.buffer.length > MAX_GIF_BYTES) {
      throw new BadRequestException("GIF exceeds 20 MB limit");
    }
    if (!looksLikeGif(args.buffer.subarray(0, 16))) {
      throw new BadRequestException(
        "Uploaded file does not look like a real GIF",
      );
    }

    if (args.ownerStatus !== "verified") {
      const existing = await this.gifs.count({
        where: { ownerId: args.ownerId },
      });
      if (existing >= UNVERIFIED_GIF_LIMIT) {
        throw new BadRequestException(
          `${UNVERIFIED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }
    if (!args.ownerApproved) {
      if (args.buffer.length > UNAPPROVED_MAX_GIF_BYTES) {
        throw new BadRequestException(
          `${UNAPPROVED_SIZE_ERROR_PREFIX}gif`,
        );
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await this.gifs.count({
        where: { ownerId: args.ownerId, createdAt: MoreThanOrEqual(since) },
      });
      if (recent >= UNAPPROVED_DAILY_GIF_LIMIT) {
        throw new BadRequestException(
          `${UNAPPROVED_LIMIT_ERROR_PREFIX}gif`,
        );
      }
    }

    // Compress the Telegram-supplied buffer to SD before storage —
    // mirrors the website upload path. Failures fall back to the
    // original buffer; we'd rather host a slightly larger file than
    // reject a Telegram upload over an ffmpeg blip.
    let storedBuffer = args.buffer;
    try {
      const compressed = await this.transcoder.compressGifToSd(args.buffer);
      if (compressed.length > 0 && compressed.length < args.buffer.length) {
        storedBuffer = compressed;
      }
    } catch (err) {
      this.logger.warn(
        `gifs.createFromBuffer compression failed: ${(err as Error).message}; keeping original`,
      );
    }

    const slug = slugify(args.title);
    const tags = args.tagNames?.length
      ? await this.tagsService.ensureTags(args.tagNames)
      : [];
    const draft = this.gifs.create({
      ownerId: args.ownerId,
      title: args.title,
      description: "",
      s3Key: "",
      sizeBytes: storedBuffer.length,
      // Telegram doesn't tell us the duration of a GIF document. We don't
      // use it for any quota — leaving 0 is safe and lets the row pass the
      // not-null constraint.
      durationSeconds: 0,
      status: "uploading",
      visibility: "public",
      // Drives the "uploaded via Telegram" badge on cards/detail pages
      // and the count on the user's profile.
      source: "telegram",
      tags,
    });
    const saved = await this.gifs.save(draft);
    const s3Key = `gifs/${saved.id}/${slug}.gif`;
    await this.s3.uploadBuffer(s3Key, storedBuffer, "image/gif");
    saved.s3Key = s3Key;
    saved.status = "ready";
    await this.gifs.save(saved);
    this.logger.log(
      `gifs.createFromBuffer ok ownerId=${args.ownerId} gifId=${saved.id} size=${args.buffer.length} source=telegram`,
    );
    void this.ensureMp4(saved.id).catch((err) =>
      this.logger.warn(
        `gifs.ensureMp4 failed gifId=${saved.id}: ${(err as Error).message}`,
      ),
    );
    this.notificationsService
      .onGifUploaded(saved.id, saved.ownerId)
      .catch((err) =>
        this.logger.warn(
          `Failed to notify subscribers of GIF upload ${saved.id}: ${(err as Error).message}`,
        ),
      );
    return saved;
  }

  /**
   * Ensure the GIF has an MP4 sibling in S3 + a populated `mp4S3Key`.
   * Idempotent: returns immediately if the column is already set, and
   * dedupes concurrent calls for the same id within this process so two
   * inline queries don't run the same ffmpeg job twice.
   *
   * The Telegram inline-query handler relies on this column to render
   * mpeg4_gif results — InlineQueryResultGif silently drops items > 1MB.
   */
  async ensureMp4(gifId: string): Promise<string | null> {
    if (this.mp4InFlight.has(gifId)) return null;
    const gif = await this.gifs.findOne({
      where: { id: gifId },
      select: ["id", "s3Key", "mp4S3Key", "thumbS3Key", "status"],
    });
    if (!gif || gif.status !== "ready" || !gif.s3Key) return null;
    if (gif.mp4S3Key && gif.thumbS3Key) return gif.mp4S3Key;

    this.mp4InFlight.add(gifId);
    try {
      // Generate whichever asset(s) are missing. Telegram needs both
      // the MP4 (mpeg4_url) and the JPEG (thumbnail_url) to render
      // the inline result — the picker silently drops a result whose
      // thumbnail can't load.
      //
      // Each transcode catches its own error so one failure can't
      // throw away the other's output. Plain Promise.all here would
      // mean a hung thumb encode forfeits the (already-finished) mp4
      // as well, leaving the row stuck in "missing both forever".
      const [mp4Key, thumbKey] = await Promise.all([
        gif.mp4S3Key
          ? Promise.resolve(gif.mp4S3Key)
          : this.transcoder
              .gifToMp4(gif.s3Key)
              .then((r) => r?.key ?? null)
              .catch((err) => {
                this.logger.warn(
                  `gifs.ensureMp4 mp4 transcode failed gifId=${gifId}: ${(err as Error).message}`,
                );
                return null;
              }),
        gif.thumbS3Key
          ? Promise.resolve(gif.thumbS3Key)
          : this.transcoder
              .gifFirstFrameJpeg(gif.s3Key)
              .then((r) => r?.key ?? null)
              .catch((err) => {
                this.logger.warn(
                  `gifs.ensureMp4 thumb extract failed gifId=${gifId}: ${(err as Error).message}`,
                );
                return null;
              }),
      ]);
      const updates: Partial<Gif> = {};
      if (mp4Key && !gif.mp4S3Key) updates.mp4S3Key = mp4Key;
      if (thumbKey && !gif.thumbS3Key) updates.thumbS3Key = thumbKey;
      if (Object.keys(updates).length > 0) {
        await this.gifs.update({ id: gifId }, updates);
      }
      return mp4Key ?? null;
    } finally {
      this.mp4InFlight.delete(gifId);
    }
  }

  /**
   * Lightweight projection used by the Telegram bot's inline-query handler.
   * Public + ready only, optional title/tag substring filter, no extras
   * computed (we don't need likes/views to render the inline gif card).
   *
   * When `restrictToFolderId` is set, the public-visibility filter is
   * lifted and an INNER JOIN against folder_gifs scopes results to the
   * caller's selected folder. The caller must already have validated
   * folder ownership upstream — at this point we trust the folder was
   * resolved from the linked user's TelegramPref, which ties it back to
   * the right account.
   */
  async searchInlineForBot(args: {
    q: string;
    limit: number;
    restrictToFolderId?: string | null;
  }): Promise<
    Array<{
      id: string;
      title: string;
      mp4S3Key: string | null;
      thumbS3Key: string | null;
    }>
  > {
    // Use limit() rather than take() — when restrictToFolderId triggers
    // the INNER JOIN below, take() wraps everything in a DISTINCT
    // subquery that references "g_createdAt", but the explicit select()
    // doesn't include createdAt, so Postgres rejects the outer ORDER
    // BY. limit() emits a plain LIMIT without the DISTINCT wrap. The
    // composite PK on folder_gifs (folderId, gifId) means a single
    // folder filter can't produce duplicate rows, so no DISTINCT needed.
    const qb = this.gifs
      .createQueryBuilder("g")
      .select(["g.id", "g.title", "g.mp4S3Key", "g.thumbS3Key"])
      .where("g.status = :s", { s: "ready" })
      .orderBy("g.createdAt", "DESC")
      .limit(args.limit);
    if (args.restrictToFolderId) {
      qb.innerJoin(
        "folder_gifs",
        "fg",
        `fg."gifId" = g.id AND fg."folderId" = :folderId`,
        { folderId: args.restrictToFolderId },
      );
    } else {
      // Public-only when no folder is in play. Folders are personal, so
      // a user navigating their own folder is allowed to see private
      // gifs they uploaded into it.
      qb.andWhere("g.visibility = :pub", { pub: "public" });
    }
    const trimmed = args.q.trim();
    if (trimmed) {
      const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        `(g.title ILIKE :qLike OR EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name ILIKE :qLike
         ))`,
        { qLike: `%${escaped}%` },
      );
    }
    return qb.getMany();
  }

  async deleteGif(gifId: string, ownerId: string, isAdmin = false) {
    const gif = await this.gifs.findOne({ where: { id: gifId } });
    if (!gif) throw new NotFoundException("Gif not found");
    if (!isAdmin && gif.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    let s3CleanupRan = false;
    if (gif.s3Key) {
      s3CleanupRan = true;
      await this.s3.deleteObject(gif.s3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete gif S3 object ${gif.s3Key}: ${(err as Error).message}`,
        );
      });
    }
    if (gif.mp4S3Key) {
      await this.s3.deleteObject(gif.mp4S3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete gif mp4 ${gif.mp4S3Key}: ${(err as Error).message}`,
        );
      });
    }
    if (gif.thumbS3Key) {
      await this.s3.deleteObject(gif.thumbS3Key).catch((err) => {
        this.logger.warn(
          `Failed to delete gif thumb ${gif.thumbS3Key}: ${(err as Error).message}`,
        );
      });
    }
    await this.gifs.delete({ id: gifId });
    const adminPrefix = isAdmin && gif.ownerId !== ownerId ? "[ADMIN] " : "";
    this.logger.log(
      `${adminPrefix}gifs.deleteGif actorId=${ownerId} gifId=${gifId} ownerId=${gif.ownerId} isAdmin=${isAdmin} s3Cleanup=${s3CleanupRan}`,
    );
    return { ok: true };
  }

  async list({
    cursor,
    limit,
    viewerId,
    sort = "newest",
  }: {
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    sort?: VideoSort;
  }) {
    if (sort !== "newest") {
      const ids = await this.rankedIds({ sort, viewerId, limit });
      const items = await this.loadByIds(ids);
      return {
        items: await this.attachExtras(items, viewerId),
        nextCursor: null,
      };
    }
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);

    if (cursor) {
      const c = await this.gifs.findOne({ where: { id: cursor } });
      if (c) qb.andWhere("g.createdAt < :cAt", { cAt: c.createdAt });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor,
    };
  }

  /** Newest-first list of one owner's GIFs for /@username pages. */
  async listByOwner({
    ownerId,
    cursor,
    limit,
    viewerId,
    isAdmin = false,
  }: {
    ownerId: string;
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    isAdmin?: boolean;
  }) {
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .andWhere("g.ownerId = :ownerId", { ownerId })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    if (viewerId !== ownerId && !isAdmin) {
      qb.andWhere("g.visibility = :pub", { pub: "public" });
    }

    if (cursor) {
      const c = await this.gifs.findOne({ where: { id: cursor } });
      if (c) qb.andWhere("g.createdAt < :cAt", { cAt: c.createdAt });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor,
    };
  }

  async search({
    q,
    tag,
    limit,
    viewerId,
    sort = "newest",
  }: {
    q?: string;
    tag?: string;
    cursor?: string;
    limit: number;
    viewerId?: string | null;
    sort?: VideoSort;
  }) {
    const trimmedQ = q?.trim() ?? "";
    const trimmedTag = tag?.trim() ?? "";
    if (!trimmedQ && !trimmedTag) {
      return { items: [], nextCursor: null };
    }
    if (sort !== "newest") {
      const ids = await this.rankedIds({
        sort,
        viewerId,
        limit,
        q: trimmedQ,
        tag: trimmedTag,
      });
      const items = await this.loadByIds(ids);
      return {
        items: await this.attachExtras(items, viewerId),
        nextCursor: null,
      };
    }

    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where("g.status = :s", { s: "ready" })
      .orderBy("g.createdAt", "DESC")
      .addOrderBy("g.id", "DESC")
      .take(limit + 1);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, trimmedQ, trimmedTag);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: await this.attachExtras(items, viewerId),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
    };
  }

  /** Atomic +1 on the gif's view counter. Mirrors VideosService. */
  async incrementView(id: string): Promise<{ viewCount: number }> {
    const row = await this.gifs.findOne({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) throw new NotFoundException("Gif not found");
    if (row.status !== "ready") return { viewCount: 0 };
    const result = await this.gifs.manager.query<Array<{ viewCount: number }>>(
      `UPDATE gifs SET "viewCount" = "viewCount" + 1
       WHERE id = $1
       RETURNING "viewCount"`,
      [id],
    );
    const raw = result[0]?.viewCount ?? 0;
    // Apply the same display floor as attachExtras so the body's
    // post-increment count stays aligned with the SSR/SEO value.
    // Without this the client overwrites the floored initialCount
    // (derived from likes+dislikes) with the raw column, creating a
    // visible discrepancy between body and meta description.
    const c = (await this.reactionsService.gifCountsFor([id])).get(id) ?? {
      likes: 0,
      dislikes: 0,
    };
    return { viewCount: Math.max(raw, c.likes + c.dislikes) };
  }

  async byId(id: string, viewerId?: string | null, isAdmin = false) {
    const g = await this.gifs.findOne({
      where: { id },
      relations: ["owner", "tags"],
    });
    if (!g) throw new NotFoundException("Gif not found");
    if (g.visibility === "private" && g.ownerId !== viewerId && !isAdmin) {
      throw new NotFoundException("Gif not found");
    }
    const [enriched] = await this.attachExtras([g], viewerId);
    const gifUrl =
      g.status === "ready"
        ? await this.media.signUrl({ kind: "gif", id: g.id })
        : null;
    return { ...enriched, gifUrl };
  }

  async suggested(
    id: string,
    limit: number,
    viewerId?: string | null,
    isAdmin = false,
    // When set, restrict candidates to gifs that are members of this
    // folder. The folders router validates the caller's read access
    // before invoking — so we can trust the membership join here as a
    // pure filter without re-checking ownership. The visibility filter
    // is also lifted in this case: a folder is personal/shared, so a
    // user browsing one is allowed to see private gifs they put in it.
    folderId?: string | null,
  ) {
    const g = await this.gifs.findOne({
      where: { id },
      relations: ["tags"],
    });
    if (!g) throw new NotFoundException("Gif not found");
    // Mirror byId: admins can view any private GIF, so they should also
    // get suggestions for it. Without this exemption an admin viewing a
    // private GIF would 404 the whole detail page (byId resolves but
    // suggested rejects, breaking the page's Promise.all).
    if (
      g.visibility === "private" &&
      g.ownerId !== viewerId &&
      !isAdmin &&
      !folderId
    ) {
      throw new NotFoundException("Gif not found");
    }
    const tagIds = g.tags.map((t) => t.id);
    if (tagIds.length === 0) return [];

    const qb = this.gifs
      .createQueryBuilder("g")
      .innerJoin("gif_tags", "gt", `gt."gifId" = g.id`)
      .leftJoinAndSelect("g.owner", "owner")
      .leftJoinAndSelect("g.tags", "tags")
      .where(`gt."tagId" IN (:...tagIds)`, { tagIds })
      .andWhere("g.id != :id", { id })
      .andWhere("g.status = :s", { s: "ready" });

    if (folderId) {
      // Inner-join folder_gifs to scope to this folder's contents only.
      // The router already validated read access, so the folder param
      // here is trusted.
      qb.innerJoin(
        "folder_gifs",
        "fg",
        `fg."gifId" = g.id AND fg."folderId" = :folderId`,
        { folderId },
      );
    } else {
      this.applyVisibility(qb, viewerId);
    }

    const rows = await qb
      .groupBy("g.id")
      .addGroupBy("owner.id")
      .addGroupBy("tags.id")
      .addSelect(`COUNT(gt."tagId")`, "shared")
      .orderBy("shared", "DESC")
      .addOrderBy("g.createdAt", "DESC")
      .limit(limit)
      .getMany();

    return this.attachExtras(rows, viewerId);
  }

  countByOwner(ownerId: string): Promise<number> {
    return this.gifs.count({ where: { ownerId, status: "ready" } });
  }

  async listPublicForSitemap(): Promise<
    Array<{ id: string; createdAt: Date }>
  > {
    return this.gifs.find({
      select: { id: true, createdAt: true },
      where: { status: "ready", visibility: "public" },
      order: { createdAt: "DESC" },
      take: 5000,
    });
  }

  private applyVisibility(
    qb: SelectQueryBuilder<Gif>,
    viewerId: string | null | undefined,
  ) {
    if (viewerId) {
      qb.andWhere("(g.visibility = :pub OR g.ownerId = :viewerId)", {
        pub: "public",
        viewerId,
      });
    } else {
      qb.andWhere("g.visibility = :pub", { pub: "public" });
    }
  }

  private applySearchFilters(
    qb: SelectQueryBuilder<Gif>,
    q: string,
    tag: string,
  ) {
    if (tag) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name = :tagName
         )`,
        { tagName: tag.toLowerCase() },
      );
    }
    if (q) {
      const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        `(g.title ILIKE :qLike OR EXISTS (
           SELECT 1 FROM gif_tags gt
           JOIN tags t ON t.id = gt."tagId"
           WHERE gt."gifId" = g.id AND t.name ILIKE :qLike
         ))`,
        { qLike: `%${escaped}%` },
      );
    }
  }

  private async rankedIds({
    sort,
    viewerId,
    limit,
    q = "",
    tag = "",
  }: {
    sort: Exclude<VideoSort, "newest">;
    viewerId: string | null | undefined;
    limit: number;
    q?: string;
    tag?: string;
  }): Promise<string[]> {
    const reactionType = sort === "mostLiked" ? "like" : "dislike";
    const qb = this.gifs
      .createQueryBuilder("g")
      .leftJoin(
        "gif_reactions",
        "r",
        `r."gifId" = g.id AND r.type = :rt`,
        { rt: reactionType },
      )
      .select("g.id", "id")
      .where("g.status = :s", { s: "ready" })
      .groupBy("g.id")
      .orderBy("COUNT(r.id)", "DESC")
      .addOrderBy(`g."createdAt"`, "DESC")
      .limit(limit);

    this.applyVisibility(qb, viewerId);
    this.applySearchFilters(qb, q, tag);
    const rows: Array<{ id: string }> = await qb.getRawMany();
    return rows.map((r) => r.id);
  }

  private async loadByIds(ids: string[]): Promise<Gif[]> {
    if (ids.length === 0) return [];
    const items = await this.gifs.find({
      where: { id: In(ids) },
      relations: ["owner", "tags"],
    });
    const byId = new Map(items.map((g) => [g.id, g]));
    return ids
      .map((id) => byId.get(id))
      .filter((g): g is Gif => g !== undefined);
  }

  /**
   * Public hydrator used by the folders router. Takes a list of gif ids
   * (already authorized — the caller validated folder ownership) and
   * returns the same shape every other listing endpoint produces:
   * gif rows + counts + viewer reaction + signed gif URL.
   */
  async hydrateByIds(
    ids: string[],
    viewerId: string | null,
  ) {
    if (ids.length === 0) return [];
    const items = await this.loadByIds(ids);
    return this.attachExtras(items, viewerId);
  }

  private async attachExtras(
    gifs: Gif[],
    viewerId: string | null | undefined,
  ) {
    if (gifs.length === 0) return [];
    const ids = gifs.map((g) => g.id);
    const [counts, viewerReactions] = await Promise.all([
      this.reactionsService.gifCountsFor(ids),
      viewerId
        ? this.reactionsService.viewerGifReactionsFor(ids, viewerId)
        : Promise.resolve(new Map<string, ReactionType>()),
    ]);

    return Promise.all(
      gifs.map(async (g) => {
        // The S3 object IS the gif itself — its proxy URL doubles as a
        // "thumbnail" for grid display.
        const url = g.status === "ready"
          ? await this.media.signUrl({ kind: "gif", id: g.id })
          : null;
        const c = counts.get(g.id) ?? { likes: 0, dislikes: 0 };
        return {
          id: g.id,
          title: g.title,
          description: g.description,
          sizeBytes: g.sizeBytes,
          durationSeconds: g.durationSeconds,
          status: g.status,
          visibility: g.visibility,
          source: g.source,
          createdAt: g.createdAt,
          owner: {
            id: g.owner.id,
            name: g.owner.name,
            username: g.owner.username,
            avatarUrl: g.owner.avatarUrl,
          },
          tags: g.tags.map((t) => ({ id: t.id, name: t.name })),
          gifUrl: url,
          thumbnailUrl: url,
          likeCount: c.likes,
          dislikeCount: c.dislikes,
          // Floor with reactions — every reactor saw it, so views can
          // never legitimately be lower. Catches old rows that predate
          // the viewCount column and reload-loops blocked by the
          // per-session client-side dedupe. Raw column stays in the DB.
          viewCount: Math.max(g.viewCount ?? 0, c.likes + c.dislikes),
          viewerReaction: viewerReactions.get(g.id) ?? null,
        };
      }),
    );
  }
}
