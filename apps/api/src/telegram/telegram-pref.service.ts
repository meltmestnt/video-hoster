import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BotLocale, TelegramPref } from "./telegram-pref.entity";

const DEFAULT_LOCALE: BotLocale = "uk";

@Injectable()
export class TelegramPrefService {
  constructor(
    @InjectRepository(TelegramPref)
    private readonly prefs: Repository<TelegramPref>,
  ) {}

  /**
   * Look up the locale for a Telegram user. Falls back to the default
   * (Ukrainian) when there's no row, which is the case for any user
   * who hasn't explicitly switched the bot language yet.
   */
  async getLocale(telegramUserId: string): Promise<BotLocale> {
    const row = await this.prefs.findOne({
      where: { telegramUserId },
      select: ["locale"],
    });
    return row?.locale ?? DEFAULT_LOCALE;
  }

  /**
   * Store the user's locale preference. Uses TypeORM's save() so an
   * existing row is updated and a new one is inserted on first call.
   */
  async setLocale(
    telegramUserId: string,
    locale: BotLocale,
  ): Promise<void> {
    await this.prefs.save({ telegramUserId, locale });
  }

  /**
   * Resolve the user's currently selected "active folder." Inline search
   * is filtered to this folder when set, and gif uploads via the bot
   * are placed into it. Null = no active folder = bot acts on the
   * full library (the default).
   */
  async getActiveFolderId(telegramUserId: string): Promise<string | null> {
    const row = await this.prefs.findOne({
      where: { telegramUserId },
      select: ["activeFolderId"],
    });
    return row?.activeFolderId ?? null;
  }

  /**
   * Set or clear the active folder. Pass `null` to clear. Validation of
   * folder ownership is the caller's job — this method only persists.
   */
  async setActiveFolderId(
    telegramUserId: string,
    folderId: string | null,
  ): Promise<void> {
    await this.prefs.save({ telegramUserId, activeFolderId: folderId });
  }
}
