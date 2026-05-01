import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TelegramLink } from "./telegram-link.entity";
import { TelegramLinkService } from "./telegram-link.service";
import { TelegramService } from "./telegram.service";
import { GifsModule } from "../gifs/gifs.module";
import { MediaModule } from "../media/media.module";
import { S3Module } from "../s3/s3.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramLink]),
    GifsModule,
    MediaModule,
    S3Module,
    UsersModule,
  ],
  providers: [TelegramLinkService, TelegramService],
  exports: [TelegramLinkService, TelegramService],
})
export class TelegramModule {}
