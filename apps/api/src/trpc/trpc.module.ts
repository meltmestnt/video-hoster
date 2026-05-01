import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { GifsModule } from "../gifs/gifs.module";
import { ScreenshotsModule } from "../screenshots/screenshots.module";
import { TagsModule } from "../tags/tags.module";
import { CommentsModule } from "../comments/comments.module";
import { ReactionsModule } from "../reactions/reactions.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { S3Module } from "../s3/s3.module";
import { AuthModule } from "../auth/auth.module";
import { TrpcService } from "./trpc.service";

@Module({
  imports: [
    UsersModule,
    VideosModule,
    GifsModule,
    ScreenshotsModule,
    TagsModule,
    CommentsModule,
    ReactionsModule,
    FavoritesModule,
    NotificationsModule,
    SubscriptionsModule,
    S3Module,
    AuthModule,
  ],
  providers: [TrpcService],
  exports: [TrpcService],
})
export class TrpcModule {}
