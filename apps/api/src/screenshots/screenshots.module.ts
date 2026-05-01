import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Screenshot } from "./screenshot.entity";
import { ScreenshotsService } from "./screenshots.service";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [TypeOrmModule.forFeature([Screenshot]), S3Module],
  providers: [ScreenshotsService],
  exports: [ScreenshotsService],
})
export class ScreenshotsModule {}
