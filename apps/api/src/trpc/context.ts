import type { User } from "../users/user.entity";
import type { UsersService } from "../users/users.service";
import type { VideosService } from "../videos/videos.service";
import type { GifsService } from "../gifs/gifs.service";
import type { ScreenshotsService } from "../screenshots/screenshots.service";
import type { TagsService } from "../tags/tags.service";
import type { CommentsService } from "../comments/comments.service";
import type { ReactionsService } from "../reactions/reactions.service";
import type { FavoritesService } from "../favorites/favorites.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { AudioService } from "../audio/audio.service";
import type { S3Service } from "../s3/s3.service";
import type { AuthService } from "../auth/auth.service";
import type { BillingService } from "../billing/billing.service";

export interface Services {
  users: UsersService;
  videos: VideosService;
  gifs: GifsService;
  screenshots: ScreenshotsService;
  tags: TagsService;
  comments: CommentsService;
  reactions: ReactionsService;
  favorites: FavoritesService;
  notifications: NotificationsService;
  subscriptions: SubscriptionsService;
  audio: AudioService;
  s3: S3Service;
  auth: AuthService;
  billing: BillingService;
}

export interface Context {
  user: User | null;
  services: Services;
}
