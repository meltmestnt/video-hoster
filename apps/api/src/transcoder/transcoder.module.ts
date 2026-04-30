import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { S3Module } from "../s3/s3.module";
import { Video } from "../videos/video.entity";
import { Thumbnail } from "../thumbnails/thumbnail.entity";
import { TranscoderService } from "./transcoder.service";

@Module({
  imports: [TypeOrmModule.forFeature([Video, Thumbnail]), S3Module],
  providers: [TranscoderService],
  exports: [TranscoderService],
})
export class TranscoderModule {}
