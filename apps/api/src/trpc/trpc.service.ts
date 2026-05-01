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
import { S3Service } from "../s3/s3.service";
import { AuthService } from "../auth/auth.service";
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
    private readonly s3: S3Service,
    private readonly auth: AuthService,
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
      s3: this.s3,
      auth: this.auth,
    };

    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return { user: null, services };
    }
    const token = header.slice(7).trim();
    if (!token) return { user: null, services };

    try {
      const payload = await this.auth.verifyToken(token);
      const user =
        payload.provider === "credentials"
          ? await this.users.findById(payload.sub)
          : await this.users.upsertFromAuthPayload(payload);
      if (!user) return { user: null, services };
      return { user, services };
    } catch {
      return { user: null, services };
    }
  };
}
