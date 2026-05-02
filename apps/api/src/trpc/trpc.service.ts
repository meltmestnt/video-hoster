import { Injectable } from "@nestjs/common";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { UsersService } from "../users/users.service";
import { VideosService } from "../videos/videos.service";
import { GifsService } from "../gifs/gifs.service";
import { ScreenshotsService } from "../screenshots/screenshots.service";
import { TagsService } from "../tags/tags.service";
import { CommentsService } from "../comments/comments.service";
import { ReactionsService } from "../reactions/reactions.service";
import { FavoritesService } from "../favorites/favorites.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AudioService } from "../audio/audio.service";
import { S3Service } from "../s3/s3.service";
import { S3CleanupService } from "../s3/s3-cleanup.service";
import { AuthService } from "../auth/auth.service";
import { BillingService } from "../billing/billing.service";
import { PushService } from "../push/push.service";
import { TelegramService } from "../telegram/telegram.service";
import { TelegramLinkService } from "../telegram/telegram-link.service";
import { appRouter, type AppRouter } from "./router";
import type { Context } from "./context";

@Injectable()
export class TrpcService {
  readonly router: AppRouter = appRouter;

  constructor(
    private readonly users: UsersService,
    private readonly videos: VideosService,
    private readonly gifs: GifsService,
    private readonly screenshots: ScreenshotsService,
    private readonly tags: TagsService,
    private readonly comments: CommentsService,
    private readonly reactions: ReactionsService,
    private readonly favorites: FavoritesService,
    private readonly notifications: NotificationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audio: AudioService,
    private readonly s3: S3Service,
    private readonly s3Cleanup: S3CleanupService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    private readonly push: PushService,
    private readonly telegram: TelegramService,
    private readonly telegramLinks: TelegramLinkService,
  ) {}

  createContext = async ({
    req,
  }: CreateExpressContextOptions): Promise<Context> => {
    const services = {
      users: this.users,
      videos: this.videos,
      gifs: this.gifs,
      screenshots: this.screenshots,
      tags: this.tags,
      comments: this.comments,
      reactions: this.reactions,
      favorites: this.favorites,
      notifications: this.notifications,
      subscriptions: this.subscriptions,
      audio: this.audio,
      s3: this.s3,
      s3Cleanup: this.s3Cleanup,
      auth: this.auth,
      billing: this.billing,
      push: this.push,
      telegram: this.telegram,
      telegramLinks: this.telegramLinks,
    };

    // Cloudflare's CF-Connecting-IP is a spoofing-resistant source for the
    // original client IP — prefer it when present, fall back to the
    // X-Forwarded-For-derived `req.ip`.
    const cfIp = req.headers["cf-connecting-ip"];
    const ip =
      (Array.isArray(cfIp) ? cfIp[0] : cfIp) || req.ip || "unknown";

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return { user: null, services, ip };
    }
    const token = header.slice(7).trim();
    if (!token) return { user: null, services, ip };

    try {
      const payload = await this.auth.verifyToken(token);
      const user =
        payload.provider === "credentials"
          ? await this.users.findById(payload.sub)
          : await this.users.upsertFromAuthPayload(payload);
      if (!user) return { user: null, services, ip };
      // Presence tracking — fire-and-forget, throttled inside
      // UsersService so a chatty SPA only writes once every 30s.
      this.users.bumpLastSeen(user.id);
      return { user, services, ip };
    } catch {
      return { user: null, services, ip };
    }
  };
}
