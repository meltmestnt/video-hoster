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
}
