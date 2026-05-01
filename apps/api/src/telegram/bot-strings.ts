import type { BotLocale } from "./telegram-pref.entity";

/**
 * All user-facing bot strings live here. New keys go in both maps;
 * the t() helper falls back to English if a UK key is missing so
 * adding a new string can't render `undefined` in Telegram.
 */
export type BotStringKey = keyof typeof STRINGS.en;

export const STRINGS: Record<BotLocale, Record<string, string>> = {
  uk: {
    "start.hello":
      "Привіт! Напишіть @{bot} <запит> у будь-якому чаті, щоб знайти GIF.\n\nЩоб завантажувати власні GIF через мене, підʼєднайте акаунт на vidsandgifs.xyz/settings.",
    "start.invalidToken":
      "Це посилання застаріле або недійсне. Відкрийте vidsandgifs.xyz/settings і натисніть «Підʼєднати Telegram» ще раз.",
    "start.accountGone":
      "Акаунт, на який вказувало це посилання, більше не існує. Створіть нове посилання на сайті.",
    "start.linked":
      "Підʼєднано до {name}. Надішліть мені GIF як файл (Документ, не Анімацію) — і я завантажу його на vids&gifs.",
    help:
      "/search <запит> — знайти GIF на vids&gifs прямо тут.\n/upload — як додати власний GIF на сайт.\nІнлайн-пошук: @{bot} <запит> — у будь-якому чаті.\n/lang — змінити мову.\n/unlink — відʼєднати Telegram від акаунту.",
    "search.usage":
      "Скористайтеся так: /search кошеня\nАбо повний пошук на сайті: {webOrigin}/search",
    "search.empty":
      "Нічого не знайдено за запитом «{q}».\nПовний пошук: {webOrigin}/search?q={qEncoded}",
    "search.more":
      "Більше результатів: {webOrigin}/search?q={qEncoded}",
    "search.itemCaption": "{title}\n{url}",
    "search.failed":
      "Пошук не вдався. Спробуйте ще раз або відкрийте {webOrigin}/search?q={qEncoded}",
    "upload.help.notLinked":
      "Спочатку підʼєднайте акаунт vids&gifs на {webOrigin}/settings, потім поверніться сюди.",
    "upload.help.linked":
      "Надішліть мені .gif як Файл (Документ — натисніть і утримуйте GIF у Telegram → «Надіслати як файл»). До 20 МБ. Підпис до файлу стане заголовком на сайті.",
    "unlink.notLinked":
      "Цей Telegram не підʼєднано до жодного акаунту.",
    "unlink.success":
      "Відʼєднано. Інлайн-пошук працює і без акаунту.",
    "upload.notLinked":
      "Спочатку підʼєднайте акаунт vids&gifs. Відкрийте vidsandgifs.xyz/settings, натисніть «Підʼєднати Telegram» і поверніться сюди до @{bot}.",
    "upload.notGif":
      "Поки що підтримуються лише .gif файли. Надішліть GIF як Файл (Документ), а не як Анімацію.",
    "upload.tooBig":
      "Цей GIF більше 20 МБ — занадто великий, щоб завантажити.",
    "upload.linkedAccountGone":
      "Підʼєднаний акаунт більше не існує. Виконайте /unlink і підʼєднайте знову з сайту.",
    "upload.success":
      'Завантажено як «{title}».\n{url}',
    "upload.failed": "Не вдалося завантажити: {message}",
    "animation.hint":
      'Це надійшло як Анімація. Щоб завантажити, надішліть GIF як Файл (Документ) — натисніть та утримуйте GIF у Telegram і виберіть «Надіслати як файл».',
    "lang.choose": "Оберіть мову.",
    "lang.set": "Мову оновлено.",
    "lang.button.uk": "🇺🇦 Українська",
    "lang.button.en": "🇬🇧 English",
    "bot.description.long":
      "Шукайте та діліться GIF з vids&gifs у будь-якому чаті. Підʼєднайте акаунт на vidsandgifs.xyz/settings, щоб завантажувати власні GIF прямо звідси. Напишіть /help для інструкцій.",
    "bot.description.short":
      "Пошук та завантаження GIF з vids&gifs.",
  },
  en: {
    "start.hello":
      "Hi! Type @{bot} <query> in any chat to search GIFs.\n\nTo upload your own GIFs through me, link your account at vidsandgifs.xyz/settings.",
    "start.invalidToken":
      'That link is expired or invalid. Open vidsandgifs.xyz/settings and click "Connect Telegram" again.',
    "start.accountGone":
      "The account this link points to no longer exists. Generate a new link from the website.",
    "start.linked":
      "Linked to {name}. Send me a GIF file (as a Document, not as Animation) and I'll upload it to vids&gifs.",
    help:
      "/search <query> — find GIFs on vids&gifs right here.\n/upload — how to add your own GIF to the site.\nInline search: @{bot} <query> — works in any chat.\n/lang — change language.\n/unlink — detach this Telegram from your account.",
    "search.usage":
      "Try it like: /search kitten\nOr full search on the site: {webOrigin}/search",
    "search.empty":
      'No matches for "{q}".\nFull search: {webOrigin}/search?q={qEncoded}',
    "search.more":
      "More results: {webOrigin}/search?q={qEncoded}",
    "search.itemCaption": "{title}\n{url}",
    "search.failed":
      "Search failed. Try again or open {webOrigin}/search?q={qEncoded}",
    "upload.help.notLinked":
      "Link your vids&gifs account first at {webOrigin}/settings, then come back here.",
    "upload.help.linked":
      "Send me a .gif as a File (Document — long-press the GIF in Telegram → \"Send as File\"). Up to 20 MB. Any caption you add becomes the title on the site.",
    "unlink.notLinked": "This Telegram isn't linked to any account.",
    "unlink.success":
      "Unlinked. Inline search still works without an account.",
    "upload.notLinked":
      'You need to link your vids&gifs account first. Open vidsandgifs.xyz/settings, click "Connect Telegram", and follow the link back to @{bot}.',
    "upload.notGif":
      "Only .gif files are supported right now. Send the GIF as a File (Document), not as Animation.",
    "upload.tooBig": "That GIF is over 20 MB — too big to upload.",
    "upload.linkedAccountGone":
      "Your linked account doesn't exist anymore. Run /unlink and re-link from the website.",
    "upload.success": 'Uploaded as "{title}".\n{url}',
    "upload.failed": "Upload failed: {message}",
    "animation.hint":
      'That came through as an Animation. To upload, please send the GIF as a File (Document) — long-press the GIF in Telegram and pick "Send as File".',
    "lang.choose": "Choose your language.",
    "lang.set": "Language updated.",
    "lang.button.uk": "🇺🇦 Українська",
    "lang.button.en": "🇬🇧 English",
    "bot.description.long":
      "Search and share GIFs from vids&gifs in any chat. Link your account at vidsandgifs.xyz/settings to upload your own GIFs straight from here. Send /help for instructions.",
    "bot.description.short": "Search & upload GIFs from vids&gifs.",
  },
} as const;

/**
 * Look up a localized string with optional `{name}` interpolation.
 * Unknown keys fall back to English; unknown English keys fall back
 * to the key name itself so a typo is visible in chat instead of
 * silently rendering "undefined".
 */
export function t(
  locale: BotLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = STRINGS[locale] ?? STRINGS.en;
  const template = dict[key] ?? STRINGS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}
