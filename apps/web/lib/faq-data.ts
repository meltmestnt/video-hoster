/**
 * FAQ source of truth — used both to render the visible page and to emit
 * the schema.org/FAQPage JSON-LD that Google parses for rich results.
 *
 * Google's rich-result spec requires the JSON-LD answer text to match the
 * answer the user actually sees, so the same array drives both. Edit Q&A
 * here and both surfaces stay in sync.
 *
 * Both English and Ukrainian copies sit on the same page so Google's
 * language-specific crawlers index whichever variant best matches the
 * search query — "what is a gif" and "що таке gif" both find us.
 */

export interface FaqEntry {
  question: string;
  /** Plain text or short HTML — `<p>`, `<a>`, `<strong>`, `<em>`. The
   *  visible page renders this via dangerouslySetInnerHTML and the
   *  JSON-LD includes the same string verbatim. */
  answerHtml: string;
}

export const FAQ_ITEMS_EN: FaqEntry[] = [
  {
    question: "What is a GIF?",
    answerHtml: `<p>A GIF (Graphics Interchange Format) is a short, looping animated image stored in a single file. Unlike a video, a GIF plays automatically, has no sound, and uses a palette of up to 256 colors per frame. It's the easiest way to share a few seconds of motion — a reaction, a meme, or a clip from a longer video — because every modern browser, chat app, and email client renders GIFs natively. On vids&amp;gifs you can upload an existing .gif file or generate one from any video you've uploaded.</p>`,
  },
  {
    question: "What types of videos can I upload?",
    answerHtml: `<p>vids&amp;gifs accepts the four most common video container formats: <strong>MP4</strong> (.mp4), <strong>QuickTime</strong> (.mov), <strong>WebM</strong> (.webm) and <strong>Matroska</strong> (.mkv). The maximum file size is 1.5 GB, and uploads above 300 MB are automatically re-encoded to 480p so they stream quickly to viewers. Files are validated by their magic bytes, not just the extension, so a renamed file won't slip through. Videos are private by default — you choose whether to share them publicly when you upload.</p>`,
  },
  {
    question: "How do I convert a GIF to MP4?",
    answerHtml: `<p>Open the upload dialog on the GIFs page, choose your .gif file, and switch the "Save as" option from <em>GIF</em> to <em>MP4</em>. The conversion runs entirely in your browser using ffmpeg.wasm — no upload to a third-party converter, no quality loss from server round-trips. The output is a 480p H.264 MP4 with no audio track, which is roughly 5–20× smaller than the original GIF while staying visually identical. The MP4 is then uploaded to your videos collection.</p>`,
  },
  {
    question: "How do I convert a video to a GIF?",
    answerHtml: `<p>Click the <em>Convert</em> button in the top bar, drop in any video file, and the in-browser editor lets you trim it to the exact 1–20 second range you want, optionally crop and rotate, then export as a GIF. Conversion happens locally with ffmpeg.wasm — your video never leaves your machine for the conversion step itself. GIFs are capped at 20 MB and 20 seconds; if your trim is too long the editor flags it before exporting. Once exported, the GIF goes straight into your gallery.</p>`,
  },
  {
    question: "Is vids&gifs free to use?",
    answerHtml: `<p>Yes. You can sign up, upload videos and GIFs, capture screenshots, comment, react, and follow other creators completely free. A paid Pro tier exists for higher daily upload quotas, but every core feature works on the free plan. There's no advertising and no third-party tracking beyond the optional analytics cookie banner.</p>`,
  },
  {
    question: "What's the maximum file size for uploads?",
    answerHtml: `<p>Videos: up to <strong>1.5 GB</strong> per file (auto-compressed to 480p above 300 MB). GIFs: up to <strong>20 MB</strong> and <strong>20 seconds</strong>. Custom thumbnails: up to 4 MB. Screenshots: up to 10 MB. Daily quotas apply per account — verified-and-approved users get 10 video uploads and 1 GB of total bandwidth per rolling 24 hours.</p>`,
  },
  {
    question: "How do I share a video, GIF, or screenshot?",
    answerHtml: `<p>Every detail page has a <em>Share</em> button that copies the canonical URL to your clipboard. Public uploads are accessible to anyone with the link; private ones stay visible only to you. The share URL never exposes the underlying S3 storage path — every media request goes through our signed media proxy, so the link you share is the only address that ever leaves your hands.</p>`,
  },
];

export const FAQ_ITEMS_UK: FaqEntry[] = [
  {
    question: "Що таке GIF?",
    answerHtml: `<p>GIF (Graphics Interchange Format) — це коротке зациклене анімоване зображення в одному файлі. На відміну від відео, GIF відтворюється автоматично, не має звуку та використовує палітру до 256 кольорів на кадр. Це найпростіший спосіб поділитися кількома секундами руху — реакцією, мемом чи фрагментом довшого відео, — адже кожен сучасний браузер, месенджер і поштовий клієнт відтворює GIF без додаткових плагінів. На vids&amp;gifs ви можете завантажити готовий .gif або згенерувати його з будь-якого свого відео.</p>`,
  },
  {
    question: "Які типи відео можна завантажувати?",
    answerHtml: `<p>vids&amp;gifs приймає чотири найпоширеніші відеоконтейнери: <strong>MP4</strong> (.mp4), <strong>QuickTime</strong> (.mov), <strong>WebM</strong> (.webm) та <strong>Matroska</strong> (.mkv). Максимальний розмір файлу — 1,5 ГБ; завантаження більші за 300 МБ автоматично перекодуються у 480p, щоб вони швидко передавалися глядачам. Файли перевіряються за «магічними байтами», а не лише за розширенням — перейменований файл не пройде. За замовчуванням відео приватні; ви самі обираєте, коли зробити їх публічними.</p>`,
  },
  {
    question: "Як конвертувати GIF у MP4?",
    answerHtml: `<p>Відкрийте діалог завантаження на сторінці GIF, оберіть свій .gif і перемкніть параметр «Зберегти як» з <em>GIF</em> на <em>MP4</em>. Конвертація відбувається повністю у вашому браузері за допомогою ffmpeg.wasm — без сторонніх конвертерів, без втрати якості на серверних циклах. На виході — MP4 480p H.264 без аудіо, який зазвичай у 5–20 разів менший за оригінальний GIF та візуально ідентичний. MP4 потім завантажується у вашу колекцію відео.</p>`,
  },
  {
    question: "Як конвертувати відео у GIF?",
    answerHtml: `<p>Натисніть кнопку <em>Convert</em> у верхній панелі, перетягніть будь-яке відео — і вбудований редактор дозволить обрізати його до потрібного діапазону 1–20 секунд, опційно кадрувати й повертати, а потім експортувати як GIF. Конвертація відбувається локально з ffmpeg.wasm — ваше відео не покидає пристрій для самої конвертації. GIF обмежені 20 МБ та 20 секундами; якщо ваш трим занадто довгий, редактор повідомить про це до експорту. Після експорту GIF одразу потрапляє у вашу галерею.</p>`,
  },
  {
    question: "Чи безкоштовний vids&gifs?",
    answerHtml: `<p>Так. Ви можете зареєструватися, завантажувати відео й GIF, робити скріншоти, коментувати, ставити реакції та підписуватися на авторів повністю безкоштовно. Платний тариф Pro існує для збільшених щоденних квот, але всі основні функції працюють на безкоштовному плані. Жодної реклами та жодного стороннього відстеження поза опційним банером аналітики.</p>`,
  },
  {
    question: "Який максимальний розмір файлу для завантаження?",
    answerHtml: `<p>Відео: до <strong>1,5 ГБ</strong> на файл (автоматичне стиснення до 480p понад 300 МБ). GIF: до <strong>20 МБ</strong> і <strong>20 секунд</strong>. Власні мініатюри: до 4 МБ. Скріншоти: до 10 МБ. Щоденні квоти діють на акаунт — верифіковані та затверджені користувачі отримують 10 завантажень відео та 1 ГБ загального трафіку за останні 24 години.</p>`,
  },
  {
    question: "Як поділитися відео, GIF або скріншотом?",
    answerHtml: `<p>На кожній сторінці деталей є кнопка <em>Share</em>, яка копіює канонічний URL у буфер обміну. Публічні завантаження доступні всім за посиланням; приватні залишаються видимими лише вам. URL для поширення ніколи не відкриває внутрішній шлях S3 — кожен запит медіа проходить через наш підписаний проксі, тож посилання, яке ви даєте, — єдина адреса, що залишає ваші руки.</p>`,
  },
];

/**
 * Build a schema.org FAQPage JSON-LD block. Only the answer's text is
 * required by Google but `name` (the question) drives the rich-result
 * carousel layout, so both are present.
 */
export function buildFaqJsonLd(items: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        // Strip wrapping <p> tags but preserve any inline HTML — Google
        // accepts a small subset (<a>, <strong>, <em>) and the spec
        // treats the answer as text/HTML.
        text: entry.answerHtml,
      },
    })),
  };
}
