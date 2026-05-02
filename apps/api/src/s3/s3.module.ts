import { Module } from "@nestjs/common";
import { S3CleanupService } from "./s3-cleanup.service";
import { S3Service } from "./s3.service";

@Module({
  providers: [S3Service, S3CleanupService],
  exports: [S3Service, S3CleanupService],
})
export class S3Module {}
