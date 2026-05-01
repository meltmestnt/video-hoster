import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { Video } from "../videos/video.entity";
import { Tag } from "../tags/tag.entity";
import { Comment } from "../comments/comment.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { VideoReaction } from "../reactions/reaction.entity";
import { CommentReaction } from "../reactions/comment-reaction.entity";
import { GifReaction } from "../reactions/gif-reaction.entity";
import { VideoFavorite } from "../favorites/favorite.entity";
import { Gif } from "../gifs/gif.entity";
import { Notification } from "../notifications/notification.entity";
import { Subscription } from "../subscriptions/subscription.entity";
import { AudioTemplate } from "../audio/audio-template.entity";
import { VideoAudioTrack } from "../audio/video-audio-track.entity";
import { Screenshot } from "../screenshots/screenshot.entity";
import { PushSubscription } from "../push/push-subscription.entity";
import { TelegramLink } from "../telegram/telegram-link.entity";
import { TelegramPref } from "../telegram/telegram-pref.entity";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        ssl:
          config.get<string>("DATABASE_SSL") === "true"
            ? { rejectUnauthorized: false }
            : false,
        entities: [
          User,
          Video,
          Tag,
          Comment,
          Thumbnail,
          VideoReaction,
          CommentReaction,
          GifReaction,
          VideoFavorite,
          Gif,
          Notification,
          Subscription,
          AudioTemplate,
          VideoAudioTrack,
          Screenshot,
          PushSubscription,
          TelegramLink,
          TelegramPref,
        ],
        synchronize: true,
        logging: ["error", "warn"],
      }),
    }),
  ],
})
export class DatabaseModule {}
