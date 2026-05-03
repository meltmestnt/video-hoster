import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DiscordLink } from "./discord-link.entity";
import { DiscordPref } from "./discord-pref.entity";
import { DiscordLinkService } from "./discord-link.service";
import { DiscordPrefService } from "./discord-pref.service";
import { DiscordService } from "./discord.service";
import { GifsModule } from "../gifs/gifs.module";
import { FoldersModule } from "../folders/folders.module";
import { MediaModule } from "../media/media.module";
import { UsersModule } from "../users/users.module";
import { TranscoderModule } from "../transcoder/transcoder.module";
import { S3Module } from "../s3/s3.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordLink, DiscordPref]),
    GifsModule,
    FoldersModule,
    MediaModule,
    UsersModule,
    TranscoderModule,
    S3Module,
  ],
  providers: [DiscordLinkService, DiscordPrefService, DiscordService],
  exports: [DiscordLinkService, DiscordPrefService, DiscordService],
})
export class DiscordModule {}
