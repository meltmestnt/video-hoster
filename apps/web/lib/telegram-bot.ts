// The bot's @handle, exposed to the client so any page can render a
// one-tap "Open in Telegram" link without hitting the API. Falls back
// to the production handle when the env var isn't set so dev builds
// still produce working links.
//
// NEXT_PUBLIC_ prefix is required: this string ends up in the client
// bundle. It's not a secret — anyone who can see the bot in Telegram
// already knows the @handle — so embedding it is fine.
export const TELEGRAM_BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "vidsandgifsbot";

/**
 * Build a t.me URL for the bot. Pass `start` to seed Telegram's bot
 * /start command with a deep-link parameter (used by the linking
 * flow); omit it for a plain "open the bot" link.
 */
export function telegramBotUrl(start?: string): string {
  const base = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  return start ? `${base}?start=${encodeURIComponent(start)}` : base;
}
