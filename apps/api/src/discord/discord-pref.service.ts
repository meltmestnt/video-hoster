import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DiscordPref } from "./discord-pref.entity";

@Injectable()
export class DiscordPrefService {
  constructor(
    @InjectRepository(DiscordPref)
    private readonly prefs: Repository<DiscordPref>,
  ) {}

  /**
   * Resolve the user's currently selected "active folder." `/gif`
   * autocomplete is filtered to this folder when set, and bot uploads
   * land in it. Null = no active folder = bot acts on the full library
   * (the default).
   */
  async getActiveFolderId(discordUserId: string): Promise<string | null> {
    const row = await this.prefs.findOne({
      where: { discordUserId },
      select: ["activeFolderId"],
    });
    return row?.activeFolderId ?? null;
  }

  /**
   * Set or clear the active folder. Pass `null` to clear. Validation
   * of folder ownership is the caller's job — this method only persists.
   */
  async setActiveFolderId(
    discordUserId: string,
    folderId: string | null,
  ): Promise<void> {
    await this.prefs.save({ discordUserId, activeFolderId: folderId });
  }
}
