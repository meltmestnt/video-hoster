import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot, InlineKeyboard } from "grammy";
import type { InlineQueryResultMpeg4Gif } from "grammy/types";
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
// /search renders previews into chat one animation per message — enough
// to surface the best matches without flooding the conversation. The
// "see more" link covers the long tail.
const SEARCH_PREVIEW_LIMIT = 5;
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
    // Slash-command menu — keeps Telegram's "/" autocomplete in sync
    // with the handlers registered in registerHandlers(). Order here is
    // the order shown in the menu.
    const commandsUk = [
      { command: "search", description: "Знайти GIF на vids&gifs" },
      { command: "upload", description: "Завантажити свій GIF" },
      { command: "help", description: "Як користуватися ботом" },
      { command: "lang", description: "Змінити мову" },
      { command: "unlink", description: "Відʼєднати акаунт" },
    ];
    const commandsEn = [
      { command: "search", description: "Search GIFs on vids&gifs" },
      { command: "upload", description: "Upload your own GIF" },
      { command: "help", description: "How to use the bot" },
      { command: "lang", description: "Change language" },
      { command: "unlink", description: "Detach account" },
    ];
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
      bot.api.setMyCommands(commandsUk),
      bot.api.setMyCommands(commandsEn, { language_code: "en" }),
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

      // Verbose log per /start — without this we can't tell whether
      // Telegram is even forwarding the payload. Common failure modes:
      //  • payload empty → user reopened the chat without re-clicking
      //    the deep link, so Telegram dropped the original `?start=` arg.
      //  • payload present but invalidToken → token expired (15 min TTL)
      //    or copy-pasted between devices and got mangled.
      this.logger.log(
        `telegram./start from=${tgUser.id} username=${tgUser.username ?? "—"} payload=${payload ? `<${payload.length}ch>` : "<empty>"}`,
      );

      if (!payload) {
        // Already-linked path: show the user their current binding rather
        // than the generic onboarding message — saves them from clicking
        // "Connect" again on /settings when nothing actually broke.
        const existingLink = await this.links.findByTelegramUserId(
          String(tgUser.id),
        );
        if (existingLink) {
          const account = await this.users.findById(existingLink.userId);
          await ctx.reply(
            t(locale, "start.alreadyLinked", {
              name: account?.name ?? "vids&gifs",
            }),
          );
          return;
        }
        // Bare /start with no payload AND no existing link — most likely
        // the deep-link payload was stripped. Tell them how to fix it.
        await ctx.reply(t(locale, "start.hello", { bot: botName }));
        return;
      }

      const userId = this.links.redeemLinkToken(payload);
      if (!userId) {
        this.logger.warn(
          `telegram./start invalidToken from=${tgUser.id} payloadLen=${payload.length}`,
        );
        await ctx.reply(t(locale, "start.invalidToken"));
        return;
      }
      const account = await this.users.findById(userId);
      if (!account) {
        this.logger.warn(
          `telegram./start accountGone from=${tgUser.id} userId=${userId}`,
        );
        await ctx.reply(t(locale, "start.accountGone"));
        return;
      }
      try {
        await this.links.link({
          telegramUserId: String(tgUser.id),
          userId,
          telegramUsername: tgUser.username ?? null,
        });
        this.logger.log(
          `telegram./start linked ok from=${tgUser.id} userId=${userId} name="${account.name}"`,
        );
      } catch (err) {
        this.logger.error(
          `telegram./start link save failed from=${tgUser.id} userId=${userId}: ${(err as Error).message}`,
          (err as Error).stack,
        );
        await ctx.reply(t(locale, "start.linkSaveFailed"));
        return;
      }
      await ctx.reply(t(locale, "start.linked", { name: account.name }));
    });

    bot.command("help", async (ctx) => {
      const locale = await this.resolveLocale(ctx.from?.id);
      const botName = this.botUsername ?? "vidsandgifsbot";
      await ctx.reply(t(locale, "help", { bot: botName }));
    });

    // ─── /search <query> ───
    // The same projection inline mode uses, but rendered into chat for
    // users who'd rather type /search than @-mention the bot. Sends up
    // to SEARCH_PREVIEW_LIMIT GIFs as animations (Telegram's media-group
    // API doesn't support type:"animation", so we send them one at a
    // time) plus a "see more" link to vidsandgifs.xyz/search.
    bot.command("search", async (ctx) => {
      const locale = await this.resolveLocale(ctx.from?.id);
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      const q = (ctx.match ?? "").trim();
      if (!q) {
        await ctx.reply(t(locale, "search.usage", { webOrigin }));
        return;
      }
      const qEncoded = encodeURIComponent(q);
      try {
        const items = await this.gifs.searchInlineForBot({
          q,
          limit: SEARCH_PREVIEW_LIMIT,
        });
        this.logger.log(
          `telegram.search from=${ctx.from?.id ?? "?"} q="${q}" matched=${items.length}`,
        );
        if (items.length === 0) {
          await ctx.reply(
            t(locale, "search.empty", { q, qEncoded, webOrigin }),
            { link_preview_options: { is_disabled: true } },
          );
          return;
        }
        // Send each preview separately so they actually animate inline.
        // Failures on individual items don't abort the loop — partial
        // results are better than zero.
        for (const item of items) {
          const url = await this.media.signUrl({ kind: "gif", id: item.id });
          if (!url) continue;
          const itemUrl = `${webOrigin}/gifs/${item.id}`;
          try {
            await ctx.replyWithAnimation(url, {
              caption: t(locale, "search.itemCaption", {
                title: item.title,
                url: itemUrl,
              }),
            });
          } catch (err) {
            this.logger.warn(
              `telegram.search send failed gifId=${item.id}: ${(err as Error).message}`,
            );
          }
        }
        await ctx.reply(
          t(locale, "search.more", { qEncoded, webOrigin }),
          { link_preview_options: { is_disabled: true } },
        );
      } catch (err) {
        this.logger.warn(
          `telegram.search failed q="${q}": ${(err as Error).message}`,
        );
        await ctx.reply(
          t(locale, "search.failed", { q, qEncoded, webOrigin }),
          { link_preview_options: { is_disabled: true } },
        );
      }
    });

    // ─── /upload ───
    // Standalone how-to. The actual upload flow runs through the
    // message:document handler below — this command is the discovery
    // hook and a guided message for users who try /upload first.
    bot.command("upload", async (ctx) => {
      const tgId = ctx.from?.id;
      const locale = await this.resolveLocale(tgId);
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      const link = tgId
        ? await this.links.findByTelegramUserId(String(tgId))
        : null;
      const key = link ? "upload.help.linked" : "upload.help.notLinked";
      await ctx.reply(t(locale, key, { webOrigin }), {
        link_preview_options: { is_disabled: true },
      });
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
      const fromId = ctx.from?.id ?? "?";
      try {
        const items = await this.gifs.searchInlineForBot({
          q,
          limit: INLINE_RESULTS_MAX,
        });
        const results: InlineQueryResultMpeg4Gif[] = [];
        const pendingBackfill: string[] = [];
        for (const g of items) {
          // Telegram silently drops InlineQueryResultGif > 1 MB, so we
          // hand it the H.264 MP4 transcode as mpeg4_gif (Telegram stores
          // every "gif" as MP4 internally anyway). Rows without mp4S3Key
          // are pre-backfill — kick off the transcode in the background
          // and skip them this time round; the next query will pick
          // them up once the column is populated.
          if (!g.mp4S3Key) {
            pendingBackfill.push(g.id);
            continue;
          }
          const url = await this.media.signUrl({ kind: "mpeg4", id: g.id });
          if (!url) continue;
          results.push({
            type: "mpeg4_gif",
            id: g.id,
            mpeg4_url: url,
            thumbnail_url: url,
            thumbnail_mime_type: "video/mp4",
            title: g.title,
          });
        }
        // Confirms Telegram is actually forwarding inline queries to us
        // (handler running) and how many results we returned. If you
        // search and don't see this line, inline mode isn't enabled in
        // @BotFather → /setinline.
        this.logger.log(
          `telegram.inline_query from=${fromId} q="${q}" matched=${items.length} returned=${results.length} backfill=${pendingBackfill.length}`,
        );
        // Don't await — ffmpeg can take a couple of seconds per gif and
        // Telegram only gives us a short window to answer the query.
        for (const id of pendingBackfill) {
          void this.gifs.ensureMp4(id).catch((err) =>
            this.logger.warn(
              `telegram.inline_query backfill failed gifId=${id}: ${(err as Error).message}`,
            ),
          );
        }
        await ctx.answerInlineQuery(results, {
          // Personal cache: results are gated on visibility filters that
          // could differ per user once we add private-to-followers, and
          // in the meantime keeps Telegram from caching empty results
          // across users while backfill is filling in.
          cache_time: INLINE_CACHE_SECONDS,
          is_personal: true,
        });
      } catch (err) {
        this.logger.warn(
          `telegram.inline_query failed from=${fromId} q="${q}": ${(err as Error).message}`,
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
