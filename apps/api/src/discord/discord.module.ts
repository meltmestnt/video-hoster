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

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordLink, DiscordPref]),
    GifsModule,
    FoldersModule,
    MediaModule,
    UsersModule,
  ],
  providers: [DiscordLinkService, DiscordPrefService, DiscordService],
  exports: [DiscordLinkService, DiscordPrefService, DiscordService],
})
export class DiscordModule {}
