import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VideoReaction } from "./reaction.entity";
import { CommentReaction } from "./comment-reaction.entity";
import { GifReaction } from "./gif-reaction.entity";
import { ReactionsService } from "./reactions.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { MediaModule } from "../media/media.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoReaction, CommentReaction, GifReaction]),
    NotificationsModule,
    MediaModule,
  ],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
