import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "./notification.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { User } from "../users/user.entity";
import { NotificationsService } from "./notifications.service";
import { S3Module } from "../s3/s3.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Video, Gif, Thumbnail, User]),
    S3Module,
    SubscriptionsModule,
  ],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
