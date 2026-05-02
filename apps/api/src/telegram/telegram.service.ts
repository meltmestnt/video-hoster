import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot, type Context, InlineKeyboard } from "grammy";
import type { InlineQueryResultMpeg4Gif } from "grammy/types";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { GifsService } from "../gifs/gifs.service";
import { MediaService } from "../media/media.service";
import { S3Service } from "../s3/s3.service";
import { UsersService } from "../users/users.service";
import { TranscoderService } from "../transcoder/transcoder.service";
import { looksLikeGif, looksLikeVideo } from "../s3/file-signatures";
import { TelegramLinkService } from "./telegram-link.service";
import { TelegramPrefService } from "./telegram-pref.service";
import { FoldersService } from "../folders/folders.service";
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
// How long an upload-in-progress session waits for the user to send a
// title/tags before being garbage-collected.
const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_TITLE_LEN = 200;
const MAX_TAGS = 10;

// URL-upload guardrails — see uploadFromUrl + fetchWithSsrfGuard for
// how these are enforced. Tuned so a casual user can paste several
// links in a row without hitting the limit, while a script trying to
// turn the bot into an SSRF probe gets stopped at the door.
const URL_FETCH_TIMEOUT_MS = 30_000;
const URL_CONNECT_TIMEOUT_MS = 10_000;
const URL_FETCH_MAX_REDIRECTS = 5;
// Per-Telegram-user cooldown between URL-fetch attempts. Cheap shield
// against someone scripting the bot to scan large IP ranges by issuing
// thousands of URL uploads.
const URL_FETCH_COOLDOWN_MS = 10_000;

type UploadStep = "title" | "tags";

interface PendingUpload {
  // GIF bytes ready to hand to gifs.createFromBuffer (already
  // transcoded from video if the source was MP4/WebM/etc).
  buffer: Buffer;
  defaultTitle: string;
  step: UploadStep;
  title?: string;
  expiresAt: number;
}

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private bot: Bot | null = null;
  private botUsername: string | null = null;
  // Flipped during onApplicationShutdown so the polling-restart loop
  // gracefully exits instead of fighting with itself during a deploy.
  private shuttingDown = false;
  // Per-Telegram-user upload state. Holds the (already-sniffed)
  // GIF buffer between the time the user sends the file and the time
  // they finish answering the title/tag prompts. In-process only — a
  // restart drops in-flight sessions, which is fine: users can re-send.
  private readonly pendingUploads = new Map<string, PendingUpload>();
  // Last URL-fetch timestamp per Telegram user. Powers a simple
  // cooldown (URL_FETCH_COOLDOWN_MS) so a script can't turn the bot
  // into an SSRF probe by spamming URLs.
  private readonly urlFetchLastAt = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly gifs: GifsService,
    private readonly media: MediaService,
    private readonly s3: S3Service,
    private readonly users: UsersService,
    private readonly links: TelegramLinkService,
    private readonly prefs: TelegramPrefService,
    private readonly folders: FoldersService,
    private readonly transcoder: TranscoderService,
  ) {}

  /**
   * Active-folder accessors exposed to the tRPC router so the web app
   * can read and write a Telegram-linked user's folder selection
   * without taking a direct dep on TelegramPrefService. Returning null
   * when no row exists keeps the bot's "no folder = full library"
   * default working without forcing every linked user to have a row.
   */
  async getActiveFolderId(telegramUserId: string): Promise<string | null> {
    return this.prefs.getActiveFolderId(telegramUserId);
  }
  async setActiveFolder(
    telegramUserId: string,
    folderId: string | null,
  ): Promise<void> {
    return this.prefs.setActiveFolderId(telegramUserId, folderId);
  }
  async clearActiveFolder(telegramUserId: string): Promise<void> {
    return this.prefs.setActiveFolderId(telegramUserId, null);
  }

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
    void this.runWithRetry();
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.bot) {
      await this.bot.stop().catch(() => {});
    }
  }

  /**
   * Long-poll forever, restarting on transient errors. Telegram returns
   * 409 Conflict whenever two consumers call getUpdates on the same
   * token — typical cause is a previous Railway replica still finishing
   * its shutdown, or a local `pnpm dev` running against prod creds. The
   * 409 clears as soon as the other consumer drops off, so we just back
   * off and retry instead of going dark until the next deploy.
   *
   * Backoff is bounded: 5s → 10s → 20s → 30s, capped. The shuttingDown
   * flag lets a graceful Nest shutdown exit the loop cleanly.
   */
  private async runWithRetry(): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    let attempt = 0;
    while (!this.shuttingDown) {
      try {
        await bot.start({
          drop_pending_updates: true,
          onStart: (info) => {
            this.botUsername = this.botUsername ?? info.username;
            this.logger.log(
              `telegram.bot started username=@${info.username} id=${info.id}`,
            );
            attempt = 0;
          },
        });
        // bot.start() resolves cleanly only when bot.stop() is called.
        // If we get here outside of shutdown, treat it as a graceful
        // restart cue.
        if (this.shuttingDown) return;
      } catch (err) {
        const message = (err as Error).message ?? "";
        const is409 = /\b409\b/.test(message) || /Conflict/i.test(message);
        // 409 specifically: Telegram's long-poll waits up to ~50s before
        // releasing the slot to a new consumer, so retrying before that
        // is a guaranteed re-fail. Wait 60s minimum, then back off
        // further on repeated conflicts (5 min cap). After ~5 conflicts
        // in a row we log a hint about multi-instance setups (typical
        // cause: local pnpm dev running with the prod token).
        const delaySec = is409
          ? Math.min(300, 60 * Math.max(1, attempt - 1))
          : Math.min(60, 10 * 2 ** Math.min(attempt, 3));
        if (is409) {
          this.logger.warn(
            `telegram.bot 409 conflict (another instance is polling) attempt=${attempt + 1}; retrying in ${delaySec}s.`,
          );
          if (attempt >= 5) {
            this.logger.warn(
              `telegram.bot persistent 409 — check that no other process is using TELEGRAM_BOT_TOKEN (typical cause: pnpm dev locally pointing at the prod token, or a stale Railway replica that hasn't shut down).`,
            );
          }
        } else {
          this.logger.error(
            `telegram.bot polling failed: ${message}; retrying in ${delaySec}s`,
            (err as Error).stack,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        attempt++;
        if (this.shuttingDown) return;
      }
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
   * Push the localized long + short descriptions, plus the display name
   * and command menu, to Telegram — but only when the value actually
   * differs from what's already set. Telegram rate-limits each setter
   * (`setMyName` is the meanest, banning the bot for ~24 h after a few
   * rapid calls), and the rate limit applies *to the API call itself*,
   * not just to changes. Spamming `setMyName("vids&gifs")` on every
   * deploy when the name is already "vids&gifs" still burns the
   * budget and eventually 429s — the symptom is that the bot stops
   * appearing in Telegram fuzzy search until the limit clears.
   *
   * Each diff check is wrapped in try/catch so a single failed setter
   * (e.g. an outstanding 429) doesn't block the other updates from
   * landing.
   *
   * Bot avatar (`/setuserpic` in BotFather) is *not* exposed via the
   * Bot API and must be set manually once.
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
      { command: "folders", description: "Показати ваші папки" },
      { command: "folder", description: "Обрати активну папку" },
      { command: "help", description: "Як користуватися ботом" },
      { command: "lang", description: "Змінити мову" },
      { command: "unlink", description: "Відʼєднати акаунт" },
    ];
    const commandsEn = [
      { command: "search", description: "Search GIFs on vids&gifs" },
      { command: "upload", description: "Upload your own GIF" },
      { command: "folders", description: "List your folders" },
      { command: "folder", description: "Pick the active folder" },
      { command: "help", description: "How to use the bot" },
      { command: "lang", description: "Change language" },
      { command: "unlink", description: "Detach account" },
    ];

    await Promise.all([
      this.syncIfChanged(
        "name",
        async () => (await bot.api.getMyName()).name,
        name,
        () => bot.api.setMyName(name),
      ),
      this.syncIfChanged(
        "name(en)",
        async () => (await bot.api.getMyName({ language_code: "en" })).name,
        name,
        () => bot.api.setMyName(name, { language_code: "en" }),
      ),
      this.syncIfChanged(
        "description",
        async () => (await bot.api.getMyDescription()).description,
        long,
        () => bot.api.setMyDescription(long),
      ),
      this.syncIfChanged(
        "description(en)",
        async () =>
          (await bot.api.getMyDescription({ language_code: "en" }))
            .description,
        longEn,
        () => bot.api.setMyDescription(longEn, { language_code: "en" }),
      ),
      this.syncIfChanged(
        "shortDescription",
        async () =>
          (await bot.api.getMyShortDescription()).short_description,
        short,
        () => bot.api.setMyShortDescription(short),
      ),
      this.syncIfChanged(
        "shortDescription(en)",
        async () =>
          (await bot.api.getMyShortDescription({ language_code: "en" }))
            .short_description,
        shortEn,
        () => bot.api.setMyShortDescription(shortEn, { language_code: "en" }),
      ),
      this.syncIfChanged(
        "commands",
        async () => JSON.stringify(await bot.api.getMyCommands()),
        JSON.stringify(commandsUk),
        () => bot.api.setMyCommands(commandsUk),
      ),
      this.syncIfChanged(
        "commands(en)",
        async () =>
          JSON.stringify(
            await bot.api.getMyCommands({ language_code: "en" }),
          ),
        JSON.stringify(commandsEn),
        () => bot.api.setMyCommands(commandsEn, { language_code: "en" }),
      ),
    ]);
  }

  /**
   * Read the current value of a Telegram bot metadata field, compare
   * to the desired one, and only invoke the setter when they differ.
   * Each step is independently try/caught so one transient 429 (or a
   * still-active 24 h ban from earlier ramp-up) doesn't block the
   * others from converging.
   */
  private async syncIfChanged(
    label: string,
    readCurrent: () => Promise<string>,
    desired: string,
    write: () => Promise<unknown>,
  ): Promise<void> {
    try {
      const current = await readCurrent();
      if (current === desired) return;
      await write();
      this.logger.log(`telegram.applyMetadata updated ${label}`);
    } catch (err) {
      this.logger.warn(
        `telegram.applyMetadata ${label} failed: ${(err as Error).message}`,
      );
    }
  }

  private async resolveLocale(
    telegramUserId: number | string | undefined,
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

  /**
   * Render the user's folder list into chat. Shared between the /folders
   * command and the /start folders deep-link fired by the inline-mode
   * "Manage folders" button — keeping them in sync means tapping the
   * button gives users the same listing they'd get if they typed the
   * command manually.
   */
  private async replyWithFolderList(
    ctx: Context,
    tgId: number | string,
  ): Promise<void> {
    const locale = await this.resolveLocale(tgId);
    const botName = this.botUsername ?? "vidsandgifsbot";
    const webOrigin =
      this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
    const link = await this.links.findByTelegramUserId(String(tgId));
    if (!link) {
      await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
      return;
    }
    const folders = await this.folders.listForOwner(link.userId);
    if (folders.length === 0) {
      await ctx.reply(t(locale, "folder.list.empty", { webOrigin }), {
        link_preview_options: { is_disabled: true },
      });
      return;
    }
    const activeId = await this.prefs.getActiveFolderId(String(tgId));
    const lines: string[] = [t(locale, "folder.list.header")];
    folders.forEach((f, i) => {
      const line = t(locale, "folder.list.item", {
        n: i + 1,
        name: f.name,
        count: f.gifCount,
      });
      const marker =
        f.id === activeId ? t(locale, "folder.list.activeMark") : "";
      lines.push(`${line}${marker}`);
    });
    lines.push("");
    lines.push(t(locale, "folder.list.footer"));
    this.logger.log(
      `telegram./folders from=${tgId} userId=${link.userId} count=${folders.length} active=${activeId ?? "none"}`,
    );
    await ctx.reply(lines.join("\n"), {
      link_preview_options: { is_disabled: true },
    });
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

      // Deep-link payload "folders" comes from the inline-mode "Manage
      // folders" button. Render the same listing as /folders rather than
      // attempting to redeem it as a link token, which would always
      // fail with start.invalidToken and confuse the user.
      if (payload === "folders") {
        await this.replyWithFolderList(ctx, tgUser.id);
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

    // ─── /folders — list the linked user's folders ───
    // Read-only command that lets a user discover what folder names
    // they can pass to /folder set. Marks whichever folder (if any) is
    // currently active so the user can tell at a glance.
    bot.command("folders", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      await this.replyWithFolderList(ctx, tgId);
    });

    // ─── /folder [set <name>|clear] — manage the active folder ───
    // Single command with subcommand dispatch on the first whitespace-
    // separated token. Bare /folder prints usage; unknown subcommands
    // also fall through to usage so a typo doesn't silently no-op.
    bot.command("folder", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const locale = await this.resolveLocale(tgId);
      const botName = this.botUsername ?? "vidsandgifsbot";
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      const raw = (ctx.match ?? "").trim();
      if (!raw) {
        await ctx.reply(t(locale, "folder.usage", { webOrigin }), {
          link_preview_options: { is_disabled: true },
        });
        return;
      }
      const spaceIdx = raw.search(/\s/);
      const sub =
        (spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)).toLowerCase();
      const rest = spaceIdx === -1 ? "" : raw.slice(spaceIdx + 1).trim();

      if (sub === "set") {
        if (!rest) {
          await ctx.reply(t(locale, "folder.set.usage"));
          return;
        }
        const link = await this.links.findByTelegramUserId(String(tgId));
        if (!link) {
          await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
          return;
        }
        const folders = await this.folders.listForOwner(link.userId);
        const target = rest.toLowerCase();
        const match = folders.find((f) => f.name.toLowerCase() === target);
        if (!match) {
          this.logger.warn(
            `telegram./folder set notFound from=${tgId} userId=${link.userId} name="${rest}"`,
          );
          await ctx.reply(t(locale, "folder.set.notFound", { name: rest }));
          return;
        }
        await this.prefs.setActiveFolderId(String(tgId), match.id);
        this.logger.log(
          `telegram./folder set ok from=${tgId} userId=${link.userId} folderId=${match.id}`,
        );
        await ctx.reply(t(locale, "folder.set.ok", { name: match.name }), {
          link_preview_options: { is_disabled: true },
        });
        return;
      }

      if (sub === "clear") {
        const link = await this.links.findByTelegramUserId(String(tgId));
        if (!link) {
          await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
          return;
        }
        await this.prefs.setActiveFolderId(String(tgId), null);
        this.logger.log(
          `telegram./folder clear from=${tgId} userId=${link.userId}`,
        );
        await ctx.reply(t(locale, "folder.clear.ok"), {
          link_preview_options: { is_disabled: true },
        });
        return;
      }

      // Unknown subcommand → show usage (helps users discover the right
      // syntax instead of silently no-opping on a typo).
      await ctx.reply(t(locale, "folder.usage", { webOrigin }), {
        link_preview_options: { is_disabled: true },
      });
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
      // Resolve user/folder state outside the try so the catch path can
      // still attach the manage-folders button if the search throws —
      // otherwise a search failure silently strips the button and the
      // user has no in-picker affordance to recover.
      let restrictToFolderId: string | null = null;
      let activeFolderName: string | null = null;
      let userIsLinked = false;
      if (ctx.from?.id) {
        const tgId = String(ctx.from.id);
        const link = await this.links.findByTelegramUserId(tgId).catch(
          () => null,
        );
        if (link) {
          userIsLinked = true;
          const folderId = await this.prefs.getActiveFolderId(tgId).catch(
            () => null,
          );
          if (folderId) {
            try {
              const f = await this.folders.findOwned(folderId, link.userId);
              restrictToFolderId = f.id;
              activeFolderName = f.name;
            } catch {
              // Folder was deleted out from under the user — clear the
              // stale pref and continue with no restriction so the user
              // doesn't get stuck on an empty inline picker until they
              // notice and clear it themselves.
              await this.prefs.setActiveFolderId(tgId, null).catch(() => {});
            }
          }
        }
      }
      const locale = await this.resolveLocale(ctx.from?.id);
      const buttonForLinkedUser:
        | { text: string; start_parameter: string }
        | undefined = userIsLinked
        ? {
            text: activeFolderName
              ? t(locale, "inline.button.activeFolder", {
                  name: activeFolderName,
                })
              : t(locale, "inline.button.manageFolders"),
            start_parameter: "folders",
          }
        : undefined;
      try {
        const items = await this.gifs.searchInlineForBot({
          q,
          limit: INLINE_RESULTS_MAX,
          restrictToFolderId,
        });
        const results: InlineQueryResultMpeg4Gif[] = [];
        const pendingBackfill: string[] = [];
        for (const g of items) {
          // Telegram silently drops InlineQueryResultGif > 1 MB, so we
          // hand it the H.264 MP4 transcode as mpeg4_gif (Telegram stores
          // every "gif" as MP4 internally anyway). The static JPEG
          // first-frame is the thumbnail — Telegram's inline previewer
          // drops results whose thumbnail it can't render, and pointing
          // thumbnail_url at the MP4 itself (per-spec but unreliable in
          // practice) is what was tripping us. Rows missing either
          // asset are pre-backfill: kick off the transcode in the
          // background and skip them this round.
          if (!g.mp4S3Key || !g.thumbS3Key) {
            pendingBackfill.push(g.id);
            continue;
          }
          const [mpegUrl, thumbUrl] = await Promise.all([
            this.media.signUrl({ kind: "mpeg4", id: g.id }),
            this.media.signUrl({ kind: "preview", id: g.id }),
          ]);
          if (!mpegUrl || !thumbUrl) continue;
          results.push({
            type: "mpeg4_gif",
            id: g.id,
            mpeg4_url: mpegUrl,
            // Some Telegram clients eagerly compute picker grid cell
            // sizes from mpeg4_width / mpeg4_height and silently drop
            // results without dimensions. 320×240 is a plausible 4:3
            // default — Telegram treats these as layout hints, it
            // doesn't validate them against the actual file.
            mpeg4_width: 320,
            mpeg4_height: 240,
            thumbnail_url: thumbUrl,
            thumbnail_mime_type: "image/jpeg",
            title: g.title,
          });
        }
        // Confirms Telegram is actually forwarding inline queries to us
        // (handler running) and how many results we returned. If you
        // search and don't see this line, inline mode isn't enabled in
        // @BotFather → /setinline.
        this.logger.log(
          `telegram.inline_query from=${fromId} q="${q}" matched=${items.length} returned=${results.length} backfill=${pendingBackfill.length} folderId=${restrictToFolderId ?? "none"}`,
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
        // Folder-restricted results are per-user — caching them globally
        // would let one user's private folder leak to others, and even
        // per-user caching would serve stale results across folder
        // toggles (cache key is just the query string). Disable both
        // when a folder is active. Unrestricted queries hit a public-
        // only filter so a shared cache is safe.
        const folderActive = restrictToFolderId !== null;
        await ctx.answerInlineQuery(results, {
          cache_time: folderActive ? 0 : INLINE_CACHE_SECONDS,
          is_personal: folderActive || userIsLinked,
          ...(buttonForLinkedUser ? { button: buttonForLinkedUser } : {}),
        });
      } catch (err) {
        this.logger.warn(
          `telegram.inline_query failed from=${fromId} q="${q}": ${(err as Error).message}`,
        );
        // Empty result + short cache so a transient failure self-clears
        // on the next keystroke. Still attach the manage-folders button
        // so a linked user has a one-tap exit even when the search blows
        // up — without it, an error path leaves them staring at an empty
        // picker with no way to clear a stuck folder filter.
        await ctx
          .answerInlineQuery([], {
            cache_time: 5,
            is_personal: userIsLinked,
            ...(buttonForLinkedUser ? { button: buttonForLinkedUser } : {}),
          })
          .catch(() => {});
      }
    });

    // ─── Document upload ───
    // No mime gate at the entry point: Telegram tags forwarded GIFs and
    // GIFs from non-mobile clients with whatever Content-Type the source
    // had ("application/octet-stream", "video/mp4", "" — all observed in
    // the wild), and the strict equality check used to reject all of
    // them. We download first, then let uploadFromTelegram sniff the
    // actual bytes and decide whether to store as GIF or transcode.
    bot.on("message:document", async (ctx) => {
      const doc = ctx.message.document;
      await this.uploadFromTelegram(ctx, {
        fileId: doc.file_id,
        fileSize: doc.file_size,
        fileName: doc.file_name,
      });
    });

    // ─── Animation upload ───
    // Telegram silently re-encodes user-sent GIFs to MP4 and labels
    // them as Animation. We accept those too — uploadFromTelegram's
    // byte sniffer routes them through the MP4 → GIF transcode path.
    bot.on("message:animation", async (ctx) => {
      const anim = ctx.message.animation;
      await this.uploadFromTelegram(ctx, {
        fileId: anim.file_id,
        fileSize: anim.file_size,
        fileName: anim.file_name,
      });
    });

    // ─── /cancel — abort an in-progress upload ───
    bot.command("cancel", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const locale = await this.resolveLocale(tgId);
      const had = this.pendingUploads.delete(String(tgId));
      await ctx.reply(
        t(locale, had ? "upload.cancelled" : "upload.noSession"),
      );
    });

    // ─── /skip — accept the default for the current step ───
    bot.command("skip", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const locale = await this.resolveLocale(tgId);
      const session = this.takeFreshSession(String(tgId));
      if (!session) {
        await ctx.reply(t(locale, "upload.noSession"));
        return;
      }
      await this.advanceUploadSession(ctx, locale, session, null);
    });

    // ─── Free-form text — title/tags input, or a bare URL upload ───
    // Registered after all slash-command handlers so commands take
    // priority. Two roles:
    //   1. Active session present → text is title/tags input.
    //   2. No session AND text is a bare http(s) URL → fetch it and
    //      treat the bytes as a fresh upload.
    // Anything else is silently ignored — we don't want the bot replying
    // to every random message in a group chat.
    bot.on("message:text", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const text = ctx.message.text.trim();
      const session = this.takeFreshSession(String(tgId));
      const locale = await this.resolveLocale(tgId);
      if (session) {
        await this.advanceUploadSession(ctx, locale, session, text);
        return;
      }
      if (looksLikeBareUrl(text)) {
        await this.uploadFromUrl(ctx, text);
      }
    });

    bot.catch((err) => {
      this.logger.error(
        `telegram.bot handler error: ${err.error}`,
        err.stack,
      );
    });
  }

  /**
   * Entry point for `message:document` and `message:animation`.
   * Downloads the file, sniffs the magic bytes, transcodes if it's
   * a video container, then stashes the GIF buffer as a pending session
   * and prompts the user for a title. Tags are collected in a follow-up
   * step (see advanceUploadSession).
   *
   *   • GIF87a/89a header → use the buffer as-is (createFromBuffer
   *     compresses to SD internally).
   *   • Video container (MP4/MOV ftyp, WebM/MKV EBML) → transcode to
   *     GIF first via the palette pipeline, then store as the session
   *     buffer.
   *   • Anything else → reject with a clear "not a video or GIF" message.
   *
   * Mime types reported by Telegram are unreliable across clients
   * (forwarded GIFs, web client documents, copy-paste flows all use
   * different Content-Type values), so we ignore them entirely and
   * trust the bytes.
   *
   * If the user is already mid-conversation on a previous upload (was
   * waiting on a title or tags reply), that prior GIF is auto-finalized
   * with its default title and no tags before this one starts a fresh
   * prompt. This matches the natural "send a GIF, send another GIF"
   * gesture: neither one is dropped, and the user only gets prompted
   * about the latest one.
   */
  private async uploadFromTelegram(
    ctx: Context,
    args: {
      fileId: string;
      fileSize: number | undefined;
      fileName: string | undefined;
    },
  ): Promise<void> {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const locale = await this.resolveLocale(tgUser.id);
    const link = await this.links.findByTelegramUserId(String(tgUser.id));
    const botName = this.botUsername ?? "vidsandgifsbot";
    if (!link) {
      await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
      return;
    }
    if ((args.fileSize ?? 0) > MAX_TELEGRAM_FILE_BYTES) {
      await ctx.reply(t(locale, "upload.tooBig"));
      return;
    }

    let downloaded: Buffer;
    try {
      const file = await ctx.api.getFile(args.fileId);
      if (!file.file_path) {
        throw new Error("Telegram getFile returned no file_path");
      }
      const downloadUrl = `https://api.telegram.org/file/bot${this.bot!.token}/${file.file_path}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`download failed: ${response.status}`);
      }
      downloaded = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      this.logger.warn(
        `telegram.upload failed userId=${link.userId}: ${(err as Error).message}`,
      );
      await ctx.reply(
        t(locale, "upload.failed", {
          message: (err as Error).message ?? "unknown error",
        }),
      );
      return;
    }

    const defaultTitle =
      (ctx.message?.caption ?? args.fileName ?? "Untitled GIF")
        .replace(/\.(gif|mp4)$/i, "")
        .slice(0, MAX_TITLE_LEN) || "Untitled GIF";
    await this.stashUploadAndPrompt(ctx, locale, link.userId, downloaded, defaultTitle);
  }

  /**
   * Bare-URL upload path. User pastes a public https URL into the chat;
   * we fetch the bytes through an SSRF-hardened pipeline and feed them
   * into the same prompt-for-title-and-tags flow as a normal Telegram
   * file upload.
   *
   * Defenses (kept deliberately tight):
   *   1. https only — http is rejected at parse time.
   *   2. URL string blocklist — userinfo, non-default ports, well-known
   *      internal-only hostnames (.internal/.local/.cluster.local/
   *      localhost) all rejected before any network I/O.
   *   3. IP allow-list at connect time — undici Agent's `connect.lookup`
   *      hook resolves the hostname and refuses any non-public address
   *      (RFC1918, loopback, link-local incl. 169.254.169.254 metadata,
   *      ULA, multicast, IPv4-mapped variants of all of these). DNS
   *      rebinding is closed because the resolved IP is also the IP we
   *      connect to.
   *   4. Manual redirect handling — every hop's URL is re-validated and
   *      goes through the same Agent, capped at URL_FETCH_MAX_REDIRECTS.
   *   5. Size cap during streaming — bail before MAX_TELEGRAM_FILE_BYTES
   *      so a hostile server can't drown the bot in bytes.
   *   6. Per-user cooldown (URL_FETCH_COOLDOWN_MS) so this can't be used
   *      as an unmetered scanner.
   *   7. Connect + body timeouts (URL_CONNECT_TIMEOUT_MS /
   *      URL_FETCH_TIMEOUT_MS) — slow-loris servers don't tie the bot
   *      up indefinitely.
   *
   * Failure modes that get reported back to the user:
   *   - URL parse error / non-https scheme / private-host string →
   *     url.invalidUrl (refused before any network I/O).
   *   - Fetch error / non-2xx / blocked IP / over size cap →
   *     url.fetchFailed with the underlying message.
   *   - Bytes don't sniff to a GIF or supported video container →
   *     handled inside stashUploadAndPrompt as upload.notGif.
   *   - Cooldown not yet elapsed → url.fetchFailed with "rate limited".
   */
  private async uploadFromUrl(ctx: Context, rawUrl: string): Promise<void> {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const locale = await this.resolveLocale(tgUser.id);
    const link = await this.links.findByTelegramUserId(String(tgUser.id));
    const botName = this.botUsername ?? "vidsandgifsbot";
    if (!link) {
      await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
      return;
    }
    const parsed = parseUrlForFetch(rawUrl);
    if (!parsed) {
      // Invalid URLs are free — only network I/O eats the cooldown.
      // Otherwise a typo would lock the user out for 10s.
      await ctx.reply(t(locale, "url.invalidUrl"));
      return;
    }
    const tgUserId = String(tgUser.id);
    const now = Date.now();
    const lastAt = this.urlFetchLastAt.get(tgUserId) ?? 0;
    if (now - lastAt < URL_FETCH_COOLDOWN_MS) {
      const wait = Math.ceil((URL_FETCH_COOLDOWN_MS - (now - lastAt)) / 1000);
      await ctx.reply(
        t(locale, "url.fetchFailed", {
          message: `rate limited — wait ${wait}s before posting another URL`,
        }),
      );
      return;
    }
    // Stamp BEFORE the fetch so a long-running download can't bypass
    // the cooldown by pipelining requests.
    this.urlFetchLastAt.set(tgUserId, now);

    await ctx.reply(t(locale, "url.fetching", { url: parsed.toString() }));

    let downloaded: Buffer;
    try {
      downloaded = await fetchWithSsrfGuard(parsed.toString(), {
        maxBytes: MAX_TELEGRAM_FILE_BYTES,
      });
    } catch (err) {
      this.logger.warn(
        `telegram.urlUpload fetch failed userId=${link.userId} url=${parsed.toString()}: ${(err as Error).message}`,
      );
      await ctx.reply(
        t(locale, "url.fetchFailed", {
          message: (err as Error).message ?? "unknown error",
        }),
      );
      return;
    }

    const defaultTitle = defaultTitleFromUrl(parsed);
    await this.stashUploadAndPrompt(
      ctx,
      locale,
      link.userId,
      downloaded,
      defaultTitle,
    );
  }

  /**
   * Shared post-download pipeline used by both `uploadFromTelegram` and
   * `uploadFromUrl`. Sniffs the first 16 bytes:
   *
   *   • GIF87a/89a header → use the buffer as-is (createFromBuffer
   *     compresses to SD internally).
   *   • Video container (MP4/MOV ftyp, WebM/MKV EBML) → transcode to
   *     GIF first via the palette pipeline.
   *   • Anything else → reject with "not a video or GIF".
   *
   * On a clean sniff, auto-finalizes any prior pending session (so a
   * user who never answered the previous prompt doesn't lose that
   * upload), then stashes the new buffer and prompts for a title.
   * Auto-finalize runs only after sniffing succeeds — a download or
   * transcode failure leaves the prior session intact.
   */
  private async stashUploadAndPrompt(
    ctx: Context,
    locale: BotLocale,
    userId: string,
    downloaded: Buffer,
    defaultTitle: string,
  ): Promise<void> {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const head16 = downloaded.subarray(0, 16);
    let gifBuffer: Buffer = downloaded;
    let kind: "gif" | "video" | "unknown";
    if (looksLikeGif(head16)) {
      kind = "gif";
    } else if (looksLikeVideo(head16)) {
      kind = "video";
      try {
        gifBuffer = await this.transcoder.compressGifToSd(downloaded);
      } catch (err) {
        this.logger.warn(
          `telegram.upload video→gif failed userId=${userId}: ${(err as Error).message}`,
        );
        await ctx.reply(
          t(locale, "upload.failed", {
            message: t(locale, "upload.convertFailed"),
          }),
        );
        return;
      }
    } else {
      kind = "unknown";
      this.logger.warn(
        `telegram.upload rejected unknown bytes userId=${userId} firstByte=0x${head16[0]?.toString(16) ?? "??"}`,
      );
      await ctx.reply(t(locale, "upload.notGif"));
      return;
    }

    const tgUserId = String(tgUser.id);
    // Auto-finalize prior session (only now that we know we have a
    // valid replacement). The "send a GIF mid-prompt" gesture cleanly
    // commits the old one and starts the new prompt.
    const prior = this.takeFreshSession(tgUserId);
    if (prior) {
      this.pendingUploads.delete(tgUserId);
      await this.finalizePendingUpload(ctx, locale, prior, []);
    }

    this.pendingUploads.set(tgUserId, {
      buffer: gifBuffer,
      defaultTitle,
      step: "title",
      expiresAt: Date.now() + UPLOAD_SESSION_TTL_MS,
    });
    this.logger.log(
      `telegram.upload pending kind=${kind} userId=${userId} downloaded=${downloaded.length} buffered=${gifBuffer.length}`,
    );
    await ctx.reply(t(locale, "upload.askTitle", { default: defaultTitle }));
  }

  /**
   * Pull a session from the map iff it's still valid. Expired sessions
   * are dropped — the caller can show an "expired, please re-send"
   * message in that case (we don't reply here so /skip and free-form
   * text both get a chance to no-op silently for users who never had
   * a session).
   */
  private takeFreshSession(tgUserId: string): PendingUpload | null {
    const session = this.pendingUploads.get(tgUserId);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      this.pendingUploads.delete(tgUserId);
      return null;
    }
    return session;
  }

  /**
   * Apply a user reply (or null = /skip) to the current upload step.
   * - title step → record title (or default), advance to tags step.
   * - tags step → parse tags (or none), finalize the upload.
   *
   * Validation failures (title too long, too many tags) leave the
   * session in place so the user can retry without re-sending the GIF.
   */
  private async advanceUploadSession(
    ctx: Context,
    locale: BotLocale,
    session: PendingUpload,
    input: string | null,
  ): Promise<void> {
    const tgUserId = String(ctx.from?.id ?? "");
    if (!tgUserId) return;

    if (session.step === "title") {
      let title = session.defaultTitle;
      if (input !== null && input.length > 0) {
        if (input.length > MAX_TITLE_LEN) {
          // Keep the session alive so user can retry without re-uploading.
          this.pendingUploads.set(tgUserId, session);
          await ctx.reply(t(locale, "upload.titleTooLong"));
          return;
        }
        title = input;
      }
      const next: PendingUpload = {
        ...session,
        step: "tags",
        title,
        expiresAt: Date.now() + UPLOAD_SESSION_TTL_MS,
      };
      this.pendingUploads.set(tgUserId, next);
      await ctx.reply(t(locale, "upload.askTags"));
      return;
    }

    // tags step
    let tagNames: string[] = [];
    if (input !== null && input.length > 0) {
      tagNames = parseTagInput(input);
      if (tagNames.length > MAX_TAGS) {
        this.pendingUploads.set(tgUserId, session);
        await ctx.reply(t(locale, "upload.tagsTooMany"));
        return;
      }
    }
    this.pendingUploads.delete(tgUserId);
    await this.finalizePendingUpload(ctx, locale, session, tagNames);
  }

  private async finalizePendingUpload(
    ctx: Context,
    locale: BotLocale,
    session: PendingUpload,
    tagNames: string[],
  ): Promise<void> {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const link = await this.links.findByTelegramUserId(String(tgUser.id));
    const botName = this.botUsername ?? "vidsandgifsbot";
    if (!link) {
      // Edge case: user unlinked between sending the GIF and finishing
      // the prompts. Fall back to the standard "link first" message.
      await ctx.reply(t(locale, "upload.notLinked", { bot: botName }));
      return;
    }
    const account = await this.users.findById(link.userId);
    if (!account) {
      await ctx.reply(t(locale, "upload.linkedAccountGone"));
      return;
    }
    const title = session.title ?? session.defaultTitle;
    await ctx.reply(t(locale, "upload.processing", { title }));
    try {
      const gif = await this.gifs.createFromBuffer({
        ownerId: account.id,
        ownerStatus: account.status,
        ownerApproved: account.role === "admin" || account.approved,
        title,
        buffer: session.buffer,
        tagNames,
      });
      // If the user has an active folder selected for the bot, drop the
      // newly-created gif into it. Best-effort: a folder-add failure
      // shouldn't make the user think the upload itself failed.
      const activeFolderId = await this.prefs.getActiveFolderId(
        String(tgUser.id),
      );
      if (activeFolderId) {
        try {
          await this.folders.addGif(account.id, activeFolderId, gif.id);
        } catch (err) {
          this.logger.warn(
            `telegram.upload folder-add failed userId=${link.userId} folderId=${activeFolderId} gifId=${gif.id}: ${(err as Error).message}`,
          );
        }
      }
      const webOrigin =
        this.config.get<string>("WEB_ORIGIN") ?? "https://vidsandgifs.xyz";
      this.logger.log(
        `telegram.upload ok userId=${link.userId} gifId=${gif.id} stored=${session.buffer.length} tags=${tagNames.length} folderId=${activeFolderId ?? "none"}`,
      );
      const url = `${webOrigin}/gifs/${gif.id}`;
      const successKey =
        tagNames.length > 0 ? "upload.successWithTags" : "upload.success";
      await ctx.reply(
        t(locale, successKey, { title, url, tags: tagNames.join(", ") }),
        { link_preview_options: { is_disabled: false } },
      );
    } catch (err) {
      this.logger.warn(
        `telegram.upload finalize failed userId=${link.userId}: ${(err as Error).message}`,
      );
      await ctx.reply(
        t(locale, "upload.failed", {
          message: (err as Error).message ?? "unknown error",
        }),
      );
    }
  }
}

/**
 * Parse a free-form tag list. Accepts commas, semicolons, or whitespace
 * as separators; lowercases everything; strips a leading "#" so users
 * who type "#cat #funny" get the obvious result; dedupes.
 */
function parseTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[,;\s]+/)) {
    const cleaned = piece.replace(/^#+/, "").trim().toLowerCase();
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

/**
 * Treat the message as a URL upload only if the *whole* text is a single
 * https URL token. Embedded URLs ("look at https://…") are intentionally
 * ignored so a chatty group doesn't trigger a fetch on every paste.
 * https only — http is rejected here too so the bot UI is consistent
 * with what the parser will accept.
 */
function looksLikeBareUrl(text: string): boolean {
  return /^https:\/\/\S+$/i.test(text);
}

/**
 * Strict URL pre-validator. Runs BEFORE any I/O. Rejects on:
 *   - parse failure
 *   - non-https scheme (no http, no file, no ftp, no gopher, …)
 *   - userinfo (http://user:pass@host) — leaks identity, smuggling vector
 *   - non-default port (anything other than 443) — closes off probing
 *     internal services that happen to be public-IP-bound
 *   - well-known internal-only hostnames (Railway/K8s/mDNS/…)
 *   - IP-literal hosts that resolve to a non-public range
 *
 * The DNS-resolution check happens later inside the undici Agent's
 * connect.lookup hook — that closes the rebinding hole because the IP
 * we validate is also the IP we connect to.
 */
function parseUrlForFetch(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  if (host === "localhost") return null;
  if (host.endsWith(".localhost")) return null;
  if (host.endsWith(".internal")) return null;
  if (host.endsWith(".local")) return null;
  if (host.endsWith(".cluster.local")) return null;
  // Default https port only — set port to "" so URL serializes cleanly.
  if (url.port && url.port !== "443") return null;
  // IP literal? Validate directly so the obvious cases bail before DNS.
  // Bracket-stripped because URL.hostname returns "[::1]" with brackets.
  const stripped = host.replace(/^\[|\]$/g, "");
  if (net.isIP(stripped) && !isPublicIp(stripped)) return null;
  return url;
}

/**
 * Turn the URL path into a sensible default title — last segment, URL-
 * decoded, extension stripped, clamped to MAX_TITLE_LEN. Used when the
 * user sends a URL and either takes the /skip default or sends nothing
 * before another upload auto-finalizes them.
 */
function defaultTitleFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  let decoded = "";
  try {
    decoded = decodeURIComponent(last);
  } catch {
    decoded = last;
  }
  decoded = decoded
    .replace(/\.(gif|mp4|webm|mov|m4v)$/i, "")
    .slice(0, MAX_TITLE_LEN);
  return decoded || "Untitled GIF";
}

/**
 * IP allow-list. Returns true ONLY for routable public unicast addresses.
 * Treat anything we can't positively identify as public as private —
 * fail-closed.
 *
 * Coverage:
 *   IPv4 — 0.0.0.0/8, 10/8, 100.64/10 CGNAT, 127/8 loopback,
 *          169.254/16 link-local (incl. 169.254.169.254 cloud metadata),
 *          172.16/12, 192.168/16, 192.0.0/24, 192.0.2/24, 192.88.99/24,
 *          198.18/15 benchmark, 198.51.100/24, 203.0.113/24,
 *          224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast.
 *   IPv6 — ::, ::1 loopback, fc00::/7 ULA, fe80::/10 link-local,
 *          ff00::/8 multicast, IPv4-mapped (::ffff:a.b.c.d → recurse),
 *          64:ff9b::/96 NAT64 (well-known prefix maps into IPv4).
 */
function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b, c] = parts;
    if (a === 0) return false;
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false; // multicast 224/4 + reserved 240/4
    return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    // IPv4-mapped IPv6 — recurse on the v4 portion so 127.0.0.1 doesn't
    // sneak through as ::ffff:127.0.0.1.
    if (lower.startsWith("::ffff:")) {
      const tail = lower.slice("::ffff:".length);
      if (net.isIPv4(tail)) return isPublicIp(tail);
    }
    if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
        lower.startsWith("fea") || lower.startsWith("feb")) return false; // fe80::/10
    if (lower.startsWith("fc") || lower.startsWith("fd")) return false;   // ULA
    if (lower.startsWith("ff")) return false;                              // multicast
    if (lower.startsWith("64:ff9b:")) return false;                        // NAT64
    return true;
  }
  return false;
}

// Undici Agent that performs an IP-allow-list check at connect time.
// The lookup hook gets called once per TCP connection — we resolve all
// addresses (`all: true`), bail if ANY of them is non-public, and only
// then hand back the first address for the actual connect. This both
// (a) prevents DNS rebinding (the IP we validate is the IP we connect
// to) and (b) closes the IPv4-mapped-IPv6 trick because isPublicIp
// recurses into the v4 part.
//
// `connect.timeout` and `headersTimeout`/`bodyTimeout` give us socket-
// level deadlines so a stuck server can't pin a worker indefinitely.
const ssrfSafeAgent = new Agent({
  connect: {
    timeout: URL_CONNECT_TIMEOUT_MS,
    // Undici 8's connector uses happy-eyeballs and calls this with
    // `options.all = true`, expecting the callback to receive an array
    // of LookupAddress objects. Older callers (or any with `all: false`)
    // expect the (err, address, family) form. Honour both — Node's
    // dns.LookupFunction type allows either return shape.
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { all: true, verbatim: true })
        .then((addrs) => {
          if (addrs.length === 0) {
            callback(
              new Error(`no DNS records for ${hostname}`) as NodeJS.ErrnoException,
              "" as never,
              0,
            );
            return;
          }
          for (const a of addrs) {
            if (!isPublicIp(a.address)) {
              callback(
                new Error(
                  `refusing to connect: ${hostname} → non-public ${a.address}`,
                ) as NodeJS.ErrnoException,
                "" as never,
                0,
              );
              return;
            }
          }
          if (options.all) {
            // (err, addresses[]) — undici unpacks .address/.family per
            // entry for happy-eyeballs.
            (callback as unknown as (
              err: NodeJS.ErrnoException | null,
              addresses: Array<{ address: string; family: number }>,
            ) => void)(null, addrs);
          } else {
            callback(null, addrs[0].address, addrs[0].family);
          }
        })
        .catch((err) =>
          callback(err as NodeJS.ErrnoException, "" as never, 0),
        );
    },
  },
  headersTimeout: URL_CONNECT_TIMEOUT_MS,
  bodyTimeout: URL_FETCH_TIMEOUT_MS,
});

/**
 * Fetch a URL through the SSRF-hardened undici Agent and return the
 * body as a Buffer, capping size during streaming. Walks redirects
 * manually (up to URL_FETCH_MAX_REDIRECTS) and re-runs the URL string
 * validation at every hop so a redirect to http://, to a userinfo URL,
 * to a non-default port, or to an internal-host string can't sneak past
 * the original parse.
 *
 * IP allow-listing happens at connect time inside the Agent — no
 * separate check needed here. The two-layer setup (string parse +
 * agent lookup) is intentional belt-and-braces.
 */
async function fetchWithSsrfGuard(
  initialUrl: string,
  opts: { maxBytes: number },
): Promise<Buffer> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= URL_FETCH_MAX_REDIRECTS; hop++) {
    const parsed = parseUrlForFetch(currentUrl);
    if (!parsed) throw new Error("URL rejected by SSRF guard");
    const res = await undiciFetch(parsed.toString(), {
      method: "GET",
      headers: {
        "user-agent": "vidsandgifs-bot/1.0 (+https://vidsandgifs.xyz)",
        accept: "image/gif,image/*,video/*;q=0.9,*/*;q=0.5",
        // Refuse content-coding entirely. Media files are already
        // compressed; gzip/br on top adds nothing legitimate but opens
        // the door to gzip-bomb amplification — a small encoded body
        // can decompress to many GB and blow past the running byte
        // cap below (which counts decoded bytes once undici inflates).
        "accept-encoding": "identity",
      },
      redirect: "manual",
      // Allow the Agent's IP-allow-list lookup to throw cleanly.
      dispatcher: ssrfSafeAgent,
    });
    if (res.status >= 300 && res.status < 400) {
      // Drain so the connection can be returned to the pool cleanly.
      const next = res.headers.get("location");
      try {
        await res.body?.cancel();
      } catch {
        // ignore — cancel is best-effort.
      }
      if (!next) throw new Error("redirect without Location header");
      currentUrl = new URL(next, parsed).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
      throw new Error(`HTTP ${res.status}`);
    }
    // Pre-check Content-Length. Honest servers tell us the size up
    // front; if it's already over the cap we can bail without reading.
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > opts.maxBytes) {
      try {
        await res.body?.cancel();
      } catch {
        // ignore
      }
      throw new Error(
        `response too large (${cl} bytes, cap ${opts.maxBytes})`,
      );
    }
    if (!res.body) throw new Error("response has no body");

    // Stream-read with running size cap so a server lying about (or
    // omitting) Content-Length still gets cut off.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > opts.maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `response exceeded size cap of ${opts.maxBytes} bytes`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  }
  throw new Error(`too many redirects (>${URL_FETCH_MAX_REDIRECTS})`);
}
