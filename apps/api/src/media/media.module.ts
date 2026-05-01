import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../users/user.entity";
import { Video } from "../videos/video.entity";
import { Gif } from "../gifs/gif.entity";
import { Screenshot } from "../screenshots/screenshot.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { AudioTemplate } from "../audio/audio-template.entity";
import { S3Module } from "../s3/s3.module";
import { MediaService } from "./media.service";
import { MediaController } from "./media.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Video, Gif, Screenshot, Thumbnail, AudioTemplate]),
    S3Module,
  ],
  providers: [MediaService],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
