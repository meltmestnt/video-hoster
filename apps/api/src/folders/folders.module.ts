import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Folder } from "./folder.entity";
import { FolderGif } from "./folder-gif.entity";
import { Gif } from "../gifs/gif.entity";
import { FoldersService } from "./folders.service";

@Module({
  imports: [TypeOrmModule.forFeature([Folder, FolderGif, Gif])],
  providers: [FoldersService],
  exports: [FoldersService, TypeOrmModule],
})
export class FoldersModule {}
