import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Gif } from "./gif.entity";
import { GifsService } from "./gifs.service";
import { TagsModule } from "../tags/tags.module";
import { S3Module } from "../s3/s3.module";
import { ReactionsModule } from "../reactions/reactions.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Gif]),
    TagsModule,
    S3Module,
    ReactionsModule,
  ],
  providers: [GifsService],
  exports: [GifsService],
})
export class GifsModule {}
