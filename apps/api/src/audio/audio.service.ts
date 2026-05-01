import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { randomBytes } from "node:crypto";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  AUDIO_EXT_BY_MIME,
  MAX_AUDIO_BYTES,
  type AllowedAudioMimeType,
} from "@repo/shared";
import { AudioTemplate } from "./audio-template.entity";
import { VideoAudioTrack } from "./video-audio-track.entity";
import { Video } from "../videos/video.entity";
import { S3Service } from "../s3/s3.service";
import { MediaService } from "../media/media.service";

interface CreateUploadArgs {
  ownerId: string;
  title: string;
  mimeType: AllowedAudioMimeType;
  sizeBytes: number;
  durationSeconds?: number;
}

interface FinalizeArgs {
  ownerId: string;
  audioTemplateId: string;
}

interface AttachArgs {
  ownerId: string;
  videoId: string;
  audioTemplateId: string;
  startSeconds?: number;
  volume?: number;
}

interface UpdateAttachmentArgs {
  ownerId: string;
  trackId: string;
  startSeconds?: number;
  volume?: number;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "audio";

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(
    @InjectRepository(AudioTemplate)
    private readonly templates: Repository<AudioTemplate>,
    @InjectRepository(VideoAudioTrack)
    private readonly tracks: Repository<VideoAudioTrack>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly s3: S3Service,
    private readonly media: MediaService,
  ) {}

  async createUpload(args: CreateUploadArgs) {
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(args.mimeType)) {
      throw new BadRequestException("Unsupported audio mime type");
    }
    if (args.sizeBytes > MAX_AUDIO_BYTES) {
      throw new BadRequestException(
        `Audio exceeds ${Math.round(MAX_AUDIO_BYTES / 1024 ** 2)} MB limit`,
      );
    }
    const ext = AUDIO_EXT_BY_MIME[args.mimeType];
    const slug = slugify(args.title);
    const token = randomBytes(6).toString("hex");
    const draft = this.templates.create({
      ownerId: args.ownerId,
      title: args.title,
      s3Key: "",
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      durationSeconds: args.durationSeconds ?? null,
      status: "uploading",
    });
    const saved = await this.templates.save(draft);
    const s3Key = `audio/${args.ownerId}/${saved.id}-${token}-${slug}.${ext}`;
    await this.templates.update({ id: saved.id }, { s3Key });
    saved.s3Key = s3Key;
    const uploadUrl = await this.s3.presignPut(s3Key, args.mimeType);
    this.logger.log(
      `audio.createUpload ownerId=${args.ownerId} size=${args.sizeBytes} mime=${args.mimeType} s3Key=${s3Key} audioTemplateId=${saved.id}`,
    );
    return { audioTemplateId: saved.id, s3Key, uploadUrl };
  }

  async finalizeUpload(args: FinalizeArgs) {
    const tpl = await this.templates.findOne({
      where: { id: args.audioTemplateId },
    });
    if (!tpl) throw new NotFoundException("Audio template not found");
    if (tpl.ownerId !== args.ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    const head = await this.s3.headObject(tpl.s3Key);
    if (!head) {
      throw new BadRequestException("Audio object not found in S3");
    }
    if (head.size > MAX_AUDIO_BYTES) {
      await this.s3.deleteObject(tpl.s3Key);
      throw new BadRequestException("Uploaded audio exceeds size limit");
    }
    tpl.sizeBytes = head.size;
    tpl.status = "ready";
    await this.templates.save(tpl);
    this.logger.log(
      `audio.finalizeUpload ok ownerId=${tpl.ownerId} audioTemplateId=${tpl.id} size=${tpl.sizeBytes}`,
    );
    return { ok: true };
  }

  async listMine(ownerId: string) {
    const rows = await this.templates.find({
      where: { ownerId, status: "ready" },
      order: { createdAt: "DESC" },
      take: 200,
    });
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        title: r.title,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        durationSeconds: r.durationSeconds,
        createdAt: r.createdAt,
        url: await this.media.signUrl({ kind: "audio", id: r.id }),
      })),
    );
  }

  async deleteTemplate(audioTemplateId: string, ownerId: string) {
    const tpl = await this.templates.findOne({
      where: { id: audioTemplateId },
    });
    if (!tpl) throw new NotFoundException("Audio template not found");
    if (tpl.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    if (tpl.s3Key) {
      await this.s3.deleteObject(tpl.s3Key).catch((err) =>
        this.logger.warn(
          `Failed to delete audio object ${tpl.s3Key}: ${(err as Error).message}`,
        ),
      );
    }
    // CASCADE on VideoAudioTrack handles detaching from any videos.
    await this.templates.delete({ id: audioTemplateId });
    return { ok: true };
  }

  async attachToVideo(args: AttachArgs) {
    const video = await this.videos.findOne({
      where: { id: args.videoId },
    });
    if (!video) throw new NotFoundException("Video not found");
    if (video.ownerId !== args.ownerId) {
      throw new ForbiddenException("Only the video's owner can attach audio");
    }
    const tpl = await this.templates.findOne({
      where: { id: args.audioTemplateId },
    });
    if (!tpl || tpl.status !== "ready") {
      throw new NotFoundException("Audio template not found");
    }
    if (tpl.ownerId !== args.ownerId) {
      throw new ForbiddenException(
        "Audio template must belong to the video's owner",
      );
    }
    const row = this.tracks.create({
      videoId: args.videoId,
      audioTemplateId: args.audioTemplateId,
      startSeconds: Math.max(0, args.startSeconds ?? 0),
      volume: clampVolume(args.volume ?? 1),
    });
    return this.tracks.save(row);
  }

  async detach(trackId: string, ownerId: string) {
    const track = await this.tracks.findOne({
      where: { id: trackId },
      relations: ["video"],
    });
    if (!track) throw new NotFoundException("Audio track not found");
    // The video FK is `onDelete: CASCADE` so this is rare, but a missing
    // video still implies the track shouldn't be there — treat as 404.
    if (!track.video) throw new NotFoundException("Audio track not found");
    if (track.video.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner of the video");
    }
    await this.tracks.delete({ id: trackId });
    return { ok: true };
  }

  async updateAttachment(args: UpdateAttachmentArgs) {
    const track = await this.tracks.findOne({
      where: { id: args.trackId },
      relations: ["video"],
    });
    if (!track) throw new NotFoundException("Audio track not found");
    if (!track.video) throw new NotFoundException("Audio track not found");
    if (track.video.ownerId !== args.ownerId) {
      throw new ForbiddenException("Not the owner of the video");
    }
    const patch: Partial<VideoAudioTrack> = {};
    if (args.startSeconds !== undefined) {
      patch.startSeconds = Math.max(0, args.startSeconds);
    }
    if (args.volume !== undefined) {
      patch.volume = clampVolume(args.volume);
    }
    if (Object.keys(patch).length > 0) {
      await this.tracks.update({ id: args.trackId }, patch);
    }
    // Re-fetch so callers get the canonical row (including any defaults
    // we didn't touch).
    return (
      (await this.tracks.findOne({
        where: { id: args.trackId },
        relations: ["audioTemplate"],
      })) ?? track
    );
  }

  async setMainMuted(videoId: string, ownerId: string, muted: boolean) {
    const video = await this.videos.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException("Video not found");
    if (video.ownerId !== ownerId) {
      throw new ForbiddenException("Not the owner");
    }
    await this.videos.update({ id: videoId }, { mainAudioMuted: muted });
    return { mainAudioMuted: muted };
  }

  /**
   * Loads every overlay track attached to the given video ids in one query
   * and returns a map of `videoId -> tracks[]` with presigned URLs already
   * resolved. Used by VideosService.attachExtras to enrich responses.
   */
  async tracksForVideos(videoIds: string[]) {
    if (videoIds.length === 0) {
      return new Map<string, AttachedTrack[]>();
    }
    const rows = await this.tracks.find({
      where: { videoId: In(videoIds) },
      relations: ["audioTemplate"],
      order: { createdAt: "ASC" },
    });

    // Sign each distinct template URL once so a video with three copies of
    // the same template doesn't cost three signing round-trips. Skip rows
    // whose template was deleted out from under them — the cascade should
    // remove them but a stale read could still surface one.
    const idToUrl = new Map<string, Promise<string | null>>();
    for (const r of rows) {
      const tplId = r.audioTemplate?.id;
      if (tplId && !idToUrl.has(tplId)) {
        idToUrl.set(
          tplId,
          this.media.signUrl({ kind: "audio", id: tplId }),
        );
      }
    }

    const result = new Map<string, AttachedTrack[]>();
    for (const r of rows) {
      if (!r.audioTemplate) continue;
      const list = result.get(r.videoId) ?? [];
      const url = r.audioTemplate.id
        ? (await idToUrl.get(r.audioTemplate.id)!) ?? null
        : null;
      list.push({
        id: r.id,
        startSeconds: r.startSeconds,
        volume: r.volume,
        audioTemplate: {
          id: r.audioTemplate.id,
          title: r.audioTemplate.title,
          mimeType: r.audioTemplate.mimeType,
          durationSeconds: r.audioTemplate.durationSeconds,
          url,
        },
      });
      result.set(r.videoId, list);
    }
    return result;
  }
}

export interface AttachedTrack {
  id: string;
  startSeconds: number;
  volume: number;
  audioTemplate: {
    id: string;
    title: string;
    mimeType: string;
    durationSeconds: number | null;
    url: string | null;
  };
}

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}
