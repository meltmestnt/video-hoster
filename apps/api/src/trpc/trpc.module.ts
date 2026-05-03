import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { GifsModule } from "../gifs/gifs.module";
import { FoldersModule } from "../folders/folders.module";
import { ScreenshotsModule } from "../screenshots/screenshots.module";
import { TagsModule } from "../tags/tags.module";
import { CommentsModule } from "../comments/comments.module";
import { ReactionsModule } from "../reactions/reactions.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AudioModule } from "../audio/audio.module";
import { S3Module } from "../s3/s3.module";
import { AuthModule } from "../auth/auth.module";
// Paid subscriptions (Lemon Squeezy) paused — see app.module.ts.
// import { BillingModule } from "../billing/billing.module";
import { PushModule } from "../push/push.module";
import { TelegramModule } from "../telegram/telegram.module";
import { DiscordModule } from "../discord/discord.module";
import { TrpcService } from "./trpc.service";

@Module({
  imports: [
    UsersModule,
    VideosModule,
    GifsModule,
    FoldersModule,
    ScreenshotsModule,
    TagsModule,
    CommentsModule,
    ReactionsModule,
    FavoritesModule,
    NotificationsModule,
    SubscriptionsModule,
    AudioModule,
    S3Module,
    AuthModule,
    // BillingModule, // paused
    PushModule,
    TelegramModule,
    DiscordModule,
  ],
  providers: [TrpcService],
  exports: [TrpcService],
})
export class TrpcModule {}
