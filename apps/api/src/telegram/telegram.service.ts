import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";
import type { InlineQueryResultGif } from "grammy/types";
import { GifsService } from "../gifs/gifs.service";
import { MediaService } from "../media/media.service";
import { S3Service } from "../s3/s3.service";
import { UsersService } from "../users/users.service";
import { TelegramLinkService } from "./telegram-link.service";

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

  private registerHandlers(bot: Bot): void {
    // ─── /start [token] ───
    // Plain /start: friendly hello. /start <token>: redeem the link token
    // issued by the website and bind this Telegram user to that account.
    bot.command("start", async (ctx) => {
      const payload = ctx.match?.trim();
      const tgUser = ctx.from;
      if (!tgUser) return;

      if (!payload) {
        await ctx.reply(
          "Hi! Type @" +
            (this.botUsername ?? "vidsandgifsbot") +
            " <query> in any chat to search GIFs.\n\n" +
            "To upload your own GIFs through me, link your account at vidsandgifs.xyz/settings.",
        );
        return;
      }

      const userId = this.links.redeemLinkToken(payload);
      if (!userId) {
        await ctx.reply(
          "That link is expired or invalid. Open vidsandgifs.xyz/settings and click \"Connect Telegram\" again.",
        );
        return;
      }
      const account = await this.users.findById(userId);
      if (!account) {
        await ctx.reply(
          "The account this link points to no longer exists. Generate a new link from the website.",
        );
        return;
      }
      await this.links.link({
        telegramUserId: String(tgUser.id),
        userId,
        telegramUsername: tgUser.username ?? null,
      });
      await ctx.reply(
        `Linked to ${account.name}. Send me a GIF file (as a Document, not as Animation) and I'll upload it to vids&gifs.`,
      );
    });

    bot.command("help", async (ctx) => {
      await ctx.reply(
        "Inline search: @" +
          (this.botUsername ?? "vidsandgifsbot") +
          " <query> — find GIFs to send in any chat.\n" +
          "Upload: send me a .gif file (as Document) in this chat after linking your account at vidsandgifs.xyz/settings.\n" +
          "/unlink — detach this Telegram from your account.",
      );
    });

    bot.command("unlink", async (ctx) => {
      const tgId = ctx.from?.id;
      if (!tgId) return;
      const link = await this.links.findByTelegramUserId(String(tgId));
      if (!link) {
        await ctx.reply("This Telegram isn't linked to any account.");
        return;
      }
      await this.links.unlinkByUserId(link.userId);
      await ctx.reply("Unlinked. Inline search still works without an account.");
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
          // Per-user cache — different users see results scoped to their
          // own typing speed without one user's stale list bleeding into
          // the next person searching the same term.
          is_personal: true,
        });
      } catch (err) {
        this.logger.warn(
          `telegram.inline_query failed q="${q}": ${(err as Error).message}`,
        );
        // Reply with an empty list so the Telegram client doesn't show the
        // user a stuck spinner.
        await ctx.answerInlineQuery([], { cache_time: 5 }).catch(() => {});
      }
    });

    // ─── Document upload ───
    // Telegram's "GIF tab" delivers MP4s as `animation`; the existing GIF
    // pipeline only handles real .gif bytes (the magic-byte check rejects
    // anything else). To keep v1 simple we only accept Documents with
    // mime image/gif. Animations get a friendly "send as file" reply.
    bot.on("message:document", async (ctx) => {
      const tgUser = ctx.from;
      if (!tgUser) return;
      const link = await this.links.findByTelegramUserId(String(tgUser.id));
      if (!link) {
        const me =
          this.botUsername ?? "the bot";
        await ctx.reply(
          `You need to link your vids&gifs account first. Open vidsandgifs.xyz/settings, click "Connect Telegram", and follow the link back to ${me}.`,
        );
        return;
      }
      const doc = ctx.message.document;
      if (doc.mime_type !== "image/gif") {
        await ctx.reply(
          "Only .gif files are supported right now. Send the GIF as a File (Document), not as Animation.",
        );
        return;
      }
      if ((doc.file_size ?? 0) > MAX_TELEGRAM_FILE_BYTES) {
        await ctx.reply("That GIF is over 20 MB — too big to upload.");
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
          await ctx.reply(
            "Your linked account doesn't exist anymore. Run /unlink and re-link from the website.",
          );
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
          `Uploaded as "${title}".\n${webOrigin}/gifs/${gif.id}`,
          { link_preview_options: { is_disabled: false } },
        );
      } catch (err) {
        this.logger.warn(
          `telegram.upload failed userId=${link.userId}: ${(err as Error).message}`,
        );
        await ctx.reply(
          `Upload failed: ${(err as Error).message ?? "unknown error"}`,
        );
      }
    });

    // Animations come through as a separate event — give a clear hint
    // instead of silence.
    bot.on("message:animation", async (ctx) => {
      await ctx.reply(
        "That came through as an Animation. To upload, please send the GIF as a File (Document) — long-press the GIF in Telegram and pick \"Send as File\".",
      );
    });

    // Catch-all for failures inside any handler so a bug in one update
    // doesn't crash the polling loop.
    bot.catch((err) => {
      this.logger.error(
        `telegram.bot handler error: ${err.error}`,
        err.stack,
      );
    });

  }
}
