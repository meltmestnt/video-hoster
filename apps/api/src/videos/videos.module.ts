import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Video } from "./video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { VideosService } from "./videos.service";
import { TagsModule } from "../tags/tags.module";
import { S3Module } from "../s3/s3.module";
import { TranscoderModule } from "../transcoder/transcoder.module";
import { ReactionsModule } from "../reactions/reactions.module";
import { FavoritesModule } from "../favorites/favorites.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Video, Thumbnail]),
    TagsModule,
    S3Module,
    TranscoderModule,
    ReactionsModule,
    FavoritesModule,
  ],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
