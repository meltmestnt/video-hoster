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
      "Привіт! Якщо ви прийшли з vidsandgifs.xyz/settings, щоб підʼєднати акаунт — Telegram міг не передати посилання-токен. Поверніться на /settings і натисніть «Підʼєднати Telegram» ще раз; коли цей чат відкриється — натисніть кнопку START, якщо вона зʼявиться.\n\nІнакше: напишіть @{bot} <запит> у будь-якому чаті, щоб знайти GIF.",
    "start.invalidToken":
      "Це посилання застаріле або недійсне (термін дії 15 хв). Відкрийте vidsandgifs.xyz/settings і натисніть «Підʼєднати Telegram» ще раз.",
    "start.accountGone":
      "Акаунт, на який вказувало це посилання, більше не існує. Створіть нове посилання на сайті.",
    "start.linked":
      "Підʼєднано до {name}. Надішліть мені GIF як файл (Документ, не Анімацію) — і я завантажу його на vids&gifs.",
    "start.alreadyLinked":
      "Цей Telegram уже підʼєднано до {name}. Можете надсилати мені GIF як файли або шукати через інлайн у будь-якому чаті.",
    "start.linkSaveFailed":
      "Не вдалося зберегти підʼєднання. Спробуйте /unlink, потім підʼєднайте знову з /settings.",
    help:
      "/search <запит> — знайти GIF за назвою або тегом.\n/upload — як додати власний GIF на сайт.\nІнлайн-пошук: @{bot} <запит> — у будь-якому чаті (теж шукає за тегами).\n/lang — змінити мову.\n/unlink — відʼєднати Telegram від акаунту.",
    "search.usage":
      "Скористайтеся так: /search кошеня\nПошук працює і за назвами, і за тегами.\nАбо повний пошук на сайті: {webOrigin}/search",
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
      "Надішліть мені .gif як Файл (Документ — натисніть і утримуйте GIF у Telegram → «Надіслати як файл») або як Анімацію. До 20 МБ. Я попрошу назву та теги, щоб GIF легше було знайти.",
    "unlink.notLinked":
      "Цей Telegram не підʼєднано до жодного акаунту.",
    "unlink.success":
      "Відʼєднано. Інлайн-пошук працює і без акаунту.",
    "upload.notLinked":
      "Спочатку підʼєднайте акаунт vids&gifs. Відкрийте vidsandgifs.xyz/settings, натисніть «Підʼєднати Telegram» і поверніться сюди до @{bot}.",
    "upload.notGif":
      "Це не схоже на GIF. Надішліть .gif як Файл (Документ) або як Анімацію — обидва варіанти працюють.",
    "upload.tooBig":
      "Цей GIF більше 20 МБ — занадто великий, щоб завантажити.",
    "upload.linkedAccountGone":
      "Підʼєднаний акаунт більше не існує. Виконайте /unlink і підʼєднайте знову з сайту.",
    "upload.success":
      'Завантажено як «{title}».\n{url}',
    "upload.successWithTags":
      'Завантажено як «{title}» (теги: {tags}).\n{url}',
    "upload.failed": "Не вдалося завантажити: {message}",
    "upload.convertFailed":
      "не вдалося перекодувати анімацію в GIF",
    "upload.askTitle":
      "Готово — отримав ваш GIF. Надішліть назву (до 200 символів) або /skip, щоб залишити «{default}». /cancel — скасувати.",
    "upload.askTags":
      "Тепер надішліть теги через кому (наприклад: «кіт, смішне, мем»; до 10 тегів). /skip — без тегів. /cancel — скасувати.",
    "upload.cancelled": "Завантаження скасовано.",
    "upload.expired":
      "Сесія завантаження прострочена — надішліть GIF ще раз.",
    "upload.titleTooLong":
      "Назва задовга — максимум 200 символів. Спробуйте ще раз або /skip.",
    "upload.tagsTooMany":
      "Забагато тегів — максимум 10. Спробуйте ще раз або /skip.",
    "upload.processing": "Завантажую «{title}»…",
    "upload.noSession":
      "Активного завантаження немає. Надішліть GIF, щоб почати.",
    "animation.hint":
      "Анімацію прийнято — конвертую у GIF і завантажую…",
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
      'Hi! If you came from vidsandgifs.xyz/settings to link your account — Telegram may not have forwarded the link token. Go back to /settings and click "Connect Telegram" again; when this chat opens, tap the START button if it shows up.\n\nOtherwise: type @{bot} <query> in any chat to search GIFs.',
    "start.invalidToken":
      'That link is expired or invalid (15-min TTL). Open vidsandgifs.xyz/settings and click "Connect Telegram" again.',
    "start.accountGone":
      "The account this link points to no longer exists. Generate a new link from the website.",
    "start.linked":
      "Linked to {name}. Send me a GIF file (as a Document, not as Animation) and I'll upload it to vids&gifs.",
    "start.alreadyLinked":
      "This Telegram is already linked to {name}. You can send me GIFs as files, or search inline from any chat.",
    "start.linkSaveFailed":
      "Couldn't save the link. Try /unlink, then connect again from /settings.",
    help:
      "/search <query> — find GIFs by title or tag.\n/upload — how to add your own GIF to the site.\nInline search: @{bot} <query> — works in any chat (also matches tags).\n/lang — change language.\n/unlink — detach this Telegram from your account.",
    "search.usage":
      "Try it like: /search kitten\nSearch matches both titles and tags.\nOr full search on the site: {webOrigin}/search",
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
      "Send me a .gif as a File (Document — long-press the GIF in Telegram → \"Send as File\") or as an Animation. Up to 20 MB. I'll ask for a name and tags so it's easier to find.",
    "unlink.notLinked": "This Telegram isn't linked to any account.",
    "unlink.success":
      "Unlinked. Inline search still works without an account.",
    "upload.notLinked":
      'You need to link your vids&gifs account first. Open vidsandgifs.xyz/settings, click "Connect Telegram", and follow the link back to @{bot}.',
    "upload.notGif":
      "That doesn't look like a GIF. Send a .gif file (Document) or an Animation — both work.",
    "upload.tooBig": "That GIF is over 20 MB — too big to upload.",
    "upload.linkedAccountGone":
      "Your linked account doesn't exist anymore. Run /unlink and re-link from the website.",
    "upload.success": 'Uploaded as "{title}".\n{url}',
    "upload.successWithTags":
      'Uploaded as "{title}" (tags: {tags}).\n{url}',
    "upload.failed": "Upload failed: {message}",
    "upload.convertFailed": "couldn't transcode the animation to GIF",
    "upload.askTitle":
      'Got your GIF. Send a title (up to 200 characters) or /skip to keep "{default}". /cancel to abort.',
    "upload.askTags":
      'Now send tags separated by commas (e.g. "cat, funny, meme"; up to 10). /skip for no tags. /cancel to abort.',
    "upload.cancelled": "Upload cancelled.",
    "upload.expired":
      "Upload session expired — please send the GIF again.",
    "upload.titleTooLong":
      "Title is too long — max 200 characters. Try again or /skip.",
    "upload.tagsTooMany":
      "Too many tags — max 10. Try again or /skip.",
    "upload.processing": 'Uploading "{title}"…',
    "upload.noSession":
      "No upload in progress. Send me a GIF to start.",
    "animation.hint":
      "Animation received — converting to GIF and uploading…",
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
