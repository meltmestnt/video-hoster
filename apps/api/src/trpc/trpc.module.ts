import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { VideosModule } from "../videos/videos.module";
import { TagsModule } from "../tags/tags.module";
import { CommentsModule } from "../comments/comments.module";
import { ReactionsModule } from "../reactions/reactions.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { S3Module } from "../s3/s3.module";
import { AuthModule } from "../auth/auth.module";
import { TrpcService } from "./trpc.service";

@Module({
  imports: [
    UsersModule,
    VideosModule,
    TagsModule,
    CommentsModule,
    ReactionsModule,
    FavoritesModule,
    S3Module,
    AuthModule,
  ],
  providers: [TrpcService],
  exports: [TrpcService],
})
export class TrpcModule {}
