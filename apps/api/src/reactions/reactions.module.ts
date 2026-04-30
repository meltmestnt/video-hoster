import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VideoReaction } from "./reaction.entity";
import { CommentReaction } from "./comment-reaction.entity";
import { ReactionsService } from "./reactions.service";

@Module({
  imports: [TypeOrmModule.forFeature([VideoReaction, CommentReaction])],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
