import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { S3Module } from "./s3/s3.module";
import { UsersModule } from "./users/users.module";
import { VideosModule } from "./videos/videos.module";
import { GifsModule } from "./gifs/gifs.module";
import { TagsModule } from "./tags/tags.module";
import { CommentsModule } from "./comments/comments.module";
import { ReactionsModule } from "./reactions/reactions.module";
import { FavoritesModule } from "./favorites/favorites.module";
import { TranscoderModule } from "./transcoder/transcoder.module";
import { TrpcModule } from "./trpc/trpc.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    S3Module,
    UsersModule,
    VideosModule,
    GifsModule,
    TagsModule,
    CommentsModule,
    ReactionsModule,
    FavoritesModule,
    TranscoderModule,
    TrpcModule,
  ],
})
export class AppModule {}
