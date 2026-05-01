import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot, InlineKeyboard } from "grammy";
import type { InlineQueryResultGif } from "grammy/types";
import { GifsService } from "../gifs/gifs.service";
import { MediaService } from "../media/media.service";
import { S3Service } from "../s3/s3.service";
import { UsersService } from "../users/users.service";
import { TelegramLinkService } from "./telegram-link.service";
import { TelegramPrefService } from "./telegram-pref.service";
import type { BotLocale } from "./telegram-pref.entity";
import { STRINGS, t } from "./bot-strings";

const INLINE_RESULTS_MAX = 50;
const INLINE_CACHE_SECONDS = 60;
// Telegram bots can `getFile` payloads up to 20 MiB without resorting to
// the local Bot API server. Matches our existing GIF size cap.
const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot | null = null;
  private botUsername: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly gifs: GifsService,
    private readonly media: MediaService,
    private readonly s3: S3Service,
    private readonly users: UsersService,
    private readonly links: TelegramLinkService,
    private readonly prefs: TelegramPrefService,
  ) {}

  /**
   * Boot polling loop only when the token is configured. In dev we'll often
   * run without TELEGRAM_BOT_TOKEN; the rest of the API should still come
   * up fine — the bot just no-ops.
   */
  async onApplicationBootstrap(): Promise<void> {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN");
    if (!token) {
      this.logger.log("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
      return;
    }
    this.botUsername =
      this.config.get<string>("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "") ??
      null;
    this.bot = new Bot(token);
    this.registerHandlers(this.bot);
    // Keep the description in sync with what we say in bot-strings — uk
    // is the default, en is registered with language_code so Telegram
    // shows it to clients running in English. Best-effort: a network
    // hiccup here shouldn't block the bot from booting.
    void this.applyMetadata(this.bot).catch((err) =>
      this.logger.warn(
        `telegram.applyMetadata failed: ${(err as Error).message}`,
      ),
    );
    // Fire-and-forget: grammY's bot.start() is a long-running poll loop.
    // Don't await — that would block app shutdown signals from Nest.
    this.bot.start({
      drop_pending_updates: true,
      onStart: (info) => {
        this.botUsername = this.botUsername ?? info.username;
        this.logger.log(
          `telegram.bot started username=@${info.username} id=${info.id}`,
        );
      },
    }).catch((err) => {
      this.logger.error(
        `telegram.bot polling failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.bot) {
      await this.bot.stop().catch(() => {});
    }
  }

  /**
   * Public-side helper used by the tRPC `telegram.startLink` procedure to
   * build the deep link the website hands the user. Returns null when the
   * bot isn't configured so the UI can hide the connect button.
   */
  buildStartLink(userId: string): { url: string; botUsername: string } | null {
    if (!this.bot || !this.botUsername) return null;
    const token = this.links.issueLinkToken(userId);
    return {
      url: `https://t.me/${this.botUsername}?start=${token}`,
      botUsername: this.botUsername,
    };
  }

  /**
   * Push the localized long + short descriptions, plus the display name,
   * to Telegram. Idempotent — Telegram only updates when the value
   * actually differs, so this is safe to run on every boot. The display
   * name doubles as Telegram's search index for the bot — setting it to
   * "vids&gifs" makes the bot turn up when users type that brand name in
   * Telegram's search bar (the username `@vidsandgifsbot` is searched
   * separately).
   *
   * Bot avatar (`/setuserpic` in BotFather) is *not* exposed via the Bot
   * API and must be set manually once.
   */
  private async applyMetadata(bot: Bot): Promise<void> {
    const name = "vids&gifs";
    const long = STRINGS.uk["bot.description.long"];
    const short = STRINGS.uk["bot.description.short"];
    const longEn = STRINGS.en["bot.description.long"];
    const shortEn = STRINGS.en["bot.description.short"];
    await Promise.all([
      // Display name is the same in both locales — it's a brand. The two
      // calls register the same value as both the language-agnostic
      // default and the explicit `en` override. grammY's signature is
      // (positional, { language_code? }) — the rest of the named
      // params live in the second arg.
      bot.api.setMyName(name),
      bot.api.setMyName(name, { language_code: "en" }),
      bot.api.setMyDescription(long),
      bot.api.setMyDescription(longEn, { language_code: "en" }),
      bot.api.setMyShortDescription(short),
      bot.api.setMyShortDescription(shortEn, { language_code: "en" }),
    ]);
    this.logger.log(`telegram.applyMetadata ok name="${name}"`);
  }

  private async resolveLocale(
    telegramUserId: number | undefined,
  ): Promise<BotLocale> {
    if (!telegramUserId) return "uk";
    return this.prefs.getLocale(String(telegramUserId));
  }

  private langKeyboard(active: BotLocale): InlineKeyboard {
    const mark = (l: BotLocale, key: string): string =>
      `${STRINGS[active][key]}${active === l ? " ✓" : ""}`;
    return new InlineKeyboard()
      .text(mark("uk", "lang.button.uk"), "lang:uk")
      .text(mark("en", "lang.button.en"), "lang:en");
  }

  private registerHandlers(bot: Bot): void {
    // ─── /start [token] ───
    bot.command("start", async (ctx) => {
      const tgUser = ctx.from;
      if (!tgUser) return;
      const locale = await this.resolveLocale(tgUser.id);
      const payload = ctx.match?.trim();
      const botName = this.botUsername ?? "vidsandgifsbot";

      if (!payload) {
        await ctx.reply(t(locale, "start.hello", { bot: botName }));
        return;
      }

      const userId = this.links.redeemLinkToken(payload);
      if (!userId) {
        await ctx.reply(t(locale, "start.invalidToken"));
        return;
      }
      const account = await this.users.findById(userId);
      if (!account) {
        await ctx.reply(t(locale, "start.accountGone"));
        return;
      }
      await this.links.link({
        telegramUserId: String(tgUser.id),
        userId,
        telegramUsername: tgUser.username ?? null,
      });
      await ctx.reply(t(locale, "start.linked", { name: account.name }));
    });

    bot.command("help", async (ctx) => {
      const locale = await this.resolveLocale(ctx.from?.id);
      const botName = this.botUsername ?? "vidsandgifsbot";
      await ctx.reply(t(locale, "help", { bot: botName }));
    });

    bot.command("unlink", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const locale = await this.resolveLocale(tgId);
      const link = await this.links.findByTelegramUserId(String(tgId));
      if (!link) {
        await ctx.reply(t(locale, "unlink.notLinked"));
        return;
      }
      await this.links.unlinkByUserId(link.userId);
      await ctx.reply(t(locale, "unlink.success"));
    });

    // ─── /lang ───
    bot.command("lang", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const locale = await this.resolveLocale(tgId);
      await ctx.reply(t(locale, "lang.choose"), {
        reply_markup: this.langKeyboard(locale),
      });
    });

    bot.callbackQuery(/^lang:(uk|en)$/, async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const next = ctx.match[1] as BotLocale;
      await this.prefs.setLocale(String(tgId), next);
      await ctx.answerCallbackQuery({ text: t(next, "lang.set") });
      // Edit the picker message in place so the checkmark moves to the
      // newly-selected button without spamming a fresh message.
      try {
        await ctx.editMessageText(t(next, "lang.choose"), {
          reply_markup: this.langKeyboard(next),
        });
      } catch {
        // Editing fails when Telegram thinks the message hasn't changed
        // (e.g. user clicked the already-active button) — harmless.
      }
    });

    // ─── Inline mode ───
    bot.on("inline_query", async (ctx) => {
      const q = ctx.inlineQuery.query.trim();
      try {
        const items = await this.gifs.searchInlineForBot({
          q,
          limit: INLINE_RESULTS_MAX,
        });
        const results: InlineQueryResultGif[] = await Promise.all(
          items.map(async (g) => {
            const url = await this.media.signUrl({ kind: "gif", id: g.id });
            return {
              type: "gif" as const,
              id: g.id,
              gif_url: url ?? "",
              thumbnail_url: url ?? "",
              thumbnail_mime_type: "image/gif" as const,
              title: g.title,
            };
          }),
        );
        const filtered = results.filter((r) => r.gif_url.length > 0);
        await ctx.answerInlineQuery(filtered, {
          cache_time: INLINE_CACHE_SECONDS,
          is_personal: true,
        });
      } catch (err) {
        this.logger.warn(
          `telegram.inline_query failed q="${q}": ${(err as Error).message}`,
        );
        await ctx.answerInlineQuery([], { cache_time: 5 }).catch(() => {});
      }
    });

    // ─── Document upload ───
    bot.on("message:document", async (ctx) => {
      const tgUser = ctx.from;
      if (!tgUser) return;
      const locale = await this.resolveLocale(tgUser.id);
      const link = await this.links.findByTelegramUserId(String(tgUser.id));
      const botName = this.botUsername ?? "vidsandgifsbot";
      if (!link) {
        await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
        return;
      }
      const doc = ctx.message.document;
      if (doc.mime_type !== "image/gif") {
        await ctx.reply(t(locale, "upload.notGif"));
        return;
      }
      if ((doc.file_size ?? 0) > MAX_TELEGRAM_FILE_BYTES) {
        await ctx.reply(t(locale, "upload.tooBig"));
        return;
      }
      try {
        const file = await ctx.api.getFile(doc.file_id);
        if (!file.file_path) {
          throw new Error("Telegram getFile returned no file_path");
        }
        const downloadUrl = `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`;
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`download failed: ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());

        const account = await this.users.findById(link.userId);
        if (!account) {
          await ctx.reply(t(locale, "upload.linkedAccountGone"));
          return;
        }

        const title =
          (ctx.message.caption ?? doc.file_name ?? "Untitled GIF")
            .replace(/\.gif$/i, "")
            .slice(0, 200) || "Untitled GIF";

        const gif = await this.gifs.createFromBuffer({
          ownerId: account.id,
          ownerStatus: account.status,
          ownerApproved: account.role === "admin" || account.approved,
          title,
          buffer,
        });
        const webOrigin =
          this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
        await ctx.reply(
          t(locale, "upload.success", {
            title,
            url: `${webOrigin}/gifs/${gif.id}`,
          }),
          { link_preview_options: { is_disabled: false } },
        );
      } catch (err) {
        this.logger.warn(
          `telegram.upload failed userId=${link.userId}: ${(err as Error).message}`,
        );
        await ctx.reply(
          t(locale, "upload.failed", {
            message: (err as Error).message ?? "unknown error",
          }),
        );
      }
    });

    bot.on("message:animation", async (ctx) => {
      const locale = await this.resolveLocale(ctx.from?.id);
      await ctx.reply(t(locale, "animation.hint"));
    });

    bot.catch((err) => {
      this.logger.error(
        `telegram.bot handler error: ${err.error}`,
        err.stack,
      );
    });
  }
}
