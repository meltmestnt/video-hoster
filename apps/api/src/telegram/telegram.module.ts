import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TelegramLink } from "./telegram-link.entity";
import { TelegramPref } from "./telegram-pref.entity";
import { TelegramLinkService } from "./telegram-link.service";
import { TelegramPrefService } from "./telegram-pref.service";
import { TelegramService } from "./telegram.service";
import { GifsModule } from "../gifs/gifs.module";
import { MediaModule } from "../media/media.module";
import { S3Module } from "../s3/s3.module";
import { TranscoderModule } from "../transcoder/transcoder.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramLink, TelegramPref]),
    GifsModule,
    MediaModule,
    S3Module,
    TranscoderModule,
    UsersModule,
  ],
  providers: [TelegramLinkService, TelegramPrefService, TelegramService],
  exports: [TelegramLinkService, TelegramPrefService, TelegramService],
})
export class TelegramModule {}
