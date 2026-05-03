import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { S3Module } from "./s3/s3.module";
import { UsersModule } from "./users/users.module";
import { VideosModule } from "./videos/videos.module";
import { GifsModule } from "./gifs/gifs.module";
import { FoldersModule } from "./folders/folders.module";
import { ScreenshotsModule } from "./screenshots/screenshots.module";
import { TagsModule } from "./tags/tags.module";
import { CommentsModule } from "./comments/comments.module";
import { ReactionsModule } from "./reactions/reactions.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { TranscoderModule } from "./transcoder/transcoder.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { AudioModule } from "./audio/audio.module";
// Paid subscriptions (Lemon Squeezy) are paused — keep the import commented
// out so a single uncomment re-enables the feature once we want it back.
// import { BillingModule } from "./billing/billing.module";
import { MediaModule } from "./media/media.module";
import { RemindersModule } from "./reminders/reminders.module";
import { PushModule } from "./push/push.module";
import { TelegramModule } from "./telegram/telegram.module";
import { DiscordModule } from "./discord/discord.module";
import { LicenseModule } from "./license/license.module";
import { TrpcModule } from "./trpc/trpc.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Registers the @Cron decorator scanner. Has to be at app root so the
    // RemindersService's daily job is picked up at startup.
    ScheduleModule.forRoot(),
    LicenseModule,
    DatabaseModule,
    AuthModule,
    S3Module,
    UsersModule,
    VideosModule,
    GifsModule,
    FoldersModule,
    ScreenshotsModule,
    TagsModule,
    CommentsModule,
    ReactionsModule,
    FavoritesModule,
    TranscoderModule,
    NotificationsModule,
    SubscriptionsModule,
    AudioModule,
    // BillingModule, // paused
    MediaModule,
    RemindersModule,
    PushModule,
    TelegramModule,
    DiscordModule,
    TrpcModule,
  ],
})
export class AppModule {}
