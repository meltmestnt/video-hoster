import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { VideoFavorite } from "./favorite.entity";

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(VideoFavorite)
    private readonly favorites: Repository<VideoFavorite>,
  ) {}

  async toggle(
    videoId: string,
    userId: string,
  ): Promise<{ favorited: boolean }> {
    const existing = await this.favorites.findOne({
      where: { videoId, userId },
    });
    if (existing) {
      await this.favorites.delete({ id: existing.id });
      return { favorited: false };
    }
    await this.favorites.save(
      this.favorites.create({ videoId, userId }),
    );
    return { favorited: true };
  }

  async favoritedSet(
    videoIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (videoIds.length === 0) return new Set();
    const rows = await this.favorites.find({
      where: { userId, videoId: In(videoIds) },
    });
    return new Set(rows.map((r) => r.videoId));
  }

  async isFavorited(videoId: string, userId: string): Promise<boolean> {
    const row = await this.favorites.findOne({ where: { videoId, userId } });
    return !!row;
  }
}
