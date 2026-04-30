import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VideoReaction } from "./reaction.entity";
import { CommentReaction } from "./comment-reaction.entity";
import { GifReaction } from "./gif-reaction.entity";
import { ReactionsService } from "./reactions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoReaction, CommentReaction, GifReaction]),
  ],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
