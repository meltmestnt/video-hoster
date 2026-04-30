import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Comment } from "./comment.entity";
import { CommentsService } from "./comments.service";
import { ReactionsModule } from "../reactions/reactions.module";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [TypeOrmModule.forFeature([Comment]), ReactionsModule, S3Module],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
