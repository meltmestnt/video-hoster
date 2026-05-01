import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Video } from "./video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { User } from "../users/user.entity";
import { VideosService } from "./videos.service";
import { TagsModule } from "../tags/tags.module";
import { S3Module } from "../s3/s3.module";
import { TranscoderModule } from "../transcoder/transcoder.module";
import { ReactionsModule } from "../reactions/reactions.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AudioModule } from "../audio/audio.module";
import { MailModule } from "../mail/mail.module";
import { MediaModule } from "../media/media.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Thumbnail, User]),
    TagsModule,
    S3Module,
    TranscoderModule,
    ReactionsModule,
    FavoritesModule,
    NotificationsModule,
    AudioModule,
    MailModule,
    MediaModule,
  ],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
