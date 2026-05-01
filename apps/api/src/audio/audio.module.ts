import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AudioTemplate } from "./audio-template.entity";
import { VideoAudioTrack } from "./video-audio-track.entity";
import { Video } from "../videos/video.entity";
import { AudioService } from "./audio.service";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([AudioTemplate, VideoAudioTrack, Video]),
    S3Module,
  ],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
