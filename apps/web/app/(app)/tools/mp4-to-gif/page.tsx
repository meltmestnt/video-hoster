import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Box,
  Flex,
  Grid,
  Heading,
  Separator,
  Text,
} from "@radix-ui/themes";
import {
  ChatBubbleIcon,
  CodeIcon,
  EnvelopeClosedIcon,
  LightningBoltIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import {
  Mp4ToGifTool,
  type Mp4ToGifStrings,
} from "@/components/Mp4ToGifTool";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

const PAGE_PATH = "/tools/mp4-to-gif";
const LOCALE_PATH: Record<Locale, string> = {
  en: PAGE_PATH,
  uk: `/uk${PAGE_PATH}`,
};

interface FaqEntry {
  question: string;
  answer: string;
}

interface CardEntry {
  title: string;
  body: string;
}

interface HowToStep {
  name: string;
  text: string;
}

interface PageCopy {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  whyHeading: string;
  whyIntro: string;
  benefit: [CardEntry, CardEntry, CardEntry];
  whereHeading: string;
  uses: [CardEntry, CardEntry, CardEntry, CardEntry];
  faqHeading: string;
  faq: FaqEntry[];
  aboutBadge: string;
  aboutHeading: string;
  aboutBody: string;
  ctaSeeLibrary: string;
  ctaGifToMp4: string;
  ctaFaq: string;
  howToName: string;
  howToDescription: string;
  howToSteps: [HowToStep, HowToStep, HowToStep];
  appFeatures: string[];
  breadcrumb: { home: string; tools: string; here: string };
  toolStrings: Mp4ToGifStrings;
}

const COPY: Record<Locale, PageCopy> = {
  en: {
    title: "MP4 to GIF converter — free, in-browser, no upload",
    description:
      "Convert MP4 (or MOV / WebM / MKV) to animated GIF instantly in your browser. No upload, no watermark, no signup. Powered by ffmpeg.wasm — your file never leaves your device.",
    ogTitle: "MP4 to GIF converter — free, in-browser",
    ogDescription:
      "Drop a video, get a GIF. Two-pass palette-optimized encode entirely in your browser via ffmpeg.wasm — no upload, no signup, no watermark.",
    whyHeading: "Why turn a video into a GIF?",
    whyIntro:
      "GIFs are bigger than equivalent MP4s, but they auto-play with no controls, render where videos can't, and read as part of the message. For short reactions, demo loops, and embed-hostile surfaces, they're still the right tool.",
    benefit: [
      {
        title: "Auto-play, everywhere",
        body: "No play button, no codec negotiation, no autoplay policy fighting the browser. Drop a GIF in any chat, README, or email and it starts looping the moment it loads.",
      },
      {
        title: "Native palette tuning",
        body: "A two-pass palettegen / paletteuse encode picks the best 256 colors for your specific clip — far cleaner than single-pass converters that use a fixed web-safe palette.",
      },
      {
        title: "Privacy by default",
        body: "The conversion runs in this browser tab using ffmpeg.wasm. Your video is never uploaded, never queued, never logged. Close the tab and nothing remains.",
      },
    ],
    whereHeading: "Where GIFs still win",
    uses: [
      {
        title: "GitHub READMEs",
        body: "GitHub renders GIFs inline in markdown. Videos render as a download link. If you want your README to demo the feature instead of asking a reader to download a clip, GIFs are still the answer.",
      },
      {
        title: "Email signatures and newsletters",
        body: "Most email clients block HTML5 video and strip half of any modern markup. An animated GIF is the lowest-common-denominator inline animation that still actually plays in Outlook, Gmail, and Apple Mail.",
      },
      {
        title: "Comment threads",
        body: "Reddit, Hacker News, Lobste.rs, and most forum software allow image embeds but not video. GIFs render where MP4 links sit unwatched at the bottom of a thread.",
      },
      {
        title: "Quick reaction clips",
        body: "A 2-second reaction GIF carries the punch of an inline animation without dragging in a video player UI. For under-3-second clips, the file-size argument for MP4 mostly evaporates anyway.",
      },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      {
        question: "Is the MP4 to GIF converter really free?",
        answer:
          "Yes. There's no signup, no watermark, no daily limit, and no paid tier on this tool. The entire conversion runs in your browser, so the only cost to anyone is your CPU. We don't show ads on this page.",
      },
      {
        question: "Does my video get uploaded anywhere?",
        answer:
          "No. The conversion happens locally inside your browser tab using ffmpeg.wasm — a WebAssembly build of the same ffmpeg used by professional video tooling. Your file is never uploaded, never copied to our servers, and never logged. You can verify by opening DevTools → Network and watching the conversion: there are no requests for your file.",
      },
      {
        question: "What video formats can I convert?",
        answer:
          "MP4, MOV (QuickTime), WebM, and MKV (Matroska) — the four most common video container formats. The tool magic-byte sniffs each file before starting, so renaming a non-video file to .mp4 is caught early instead of crashing the encoder.",
      },
      {
        question: "Why convert an MP4 to a GIF when GIFs are bigger?",
        answer:
          "GIFs auto-play with no controls, render natively in places that don't load video (GitHub READMEs, RSS readers, some email clients, older forums, embed-restricted comment threads), and feel like part of the message rather than a player widget. They're the right tool for short reaction clips, demo loops in documentation, and chats where the visual punch of an inline-playing animation matters more than file size.",
      },
      {
        question: "What's the maximum file size?",
        answer:
          "There's no hard cap, but in practice browsers struggle past ~100 MB because the entire file has to fit in WebAssembly memory. For best results, keep clips under 20 seconds — GIFs grow quickly with duration, and short clips look more like animations than slow-motion sequences.",
      },
      {
        question: "What resolution and framerate does the GIF use?",
        answer:
          "The output is 480px wide (preserving aspect ratio) at 12 fps. That's the sweet spot for size and smoothness — wider GIFs balloon in size without much perceived quality gain because the format caps at a 256-color palette regardless of resolution.",
      },
      {
        question: "Does the converter use a single-pass or two-pass palette?",
        answer:
          "Two-pass. ffmpeg.wasm runs palettegen first to compute the optimal 256-color palette for your specific clip, then paletteuse with Bayer dithering to apply it. The result is dramatically cleaner than single-pass converters that use a fixed web-safe palette — colors look like the source instead of a 1995 desktop screenshot.",
      },
      {
        question: "Why does the first conversion take longer than the rest?",
        answer:
          "The first time you convert anything in this tab, the browser downloads about 25 MB of WebAssembly (the ffmpeg core). After that it's cached, and every subsequent conversion in the same session starts instantly. If you reload the page or open a private window, the download repeats.",
      },
      {
        question: "I want to do the reverse — GIF to MP4. Where?",
        answer:
          "We have a dedicated tool for that at vidsandgifs.com/tools/gif-to-mp4. Drop your GIF there and get a 480p MP4 typically 5–20× smaller than the source.",
      },
    ],
    aboutBadge: "About vids&gifs",
    aboutHeading:
      "One private library of GIFs and videos, sendable from every chat",
    aboutBody:
      "This converter is a free side-tool. The main vids&gifs product is a private, cross-chat library: upload your GIFs and short videos once, and send them inline from any Telegram chat (@vidsandgifsbot) or any Discord channel (/gif) — no copy-pasting links, no rebuilding folders per platform.",
    ctaSeeLibrary: "See how the cross-chat library works →",
    ctaGifToMp4: "GIF → MP4 converter",
    ctaFaq: "Read the full FAQ",
    howToName: "How to convert an MP4 to a GIF in your browser",
    howToDescription:
      "Convert any video (MP4, MOV, WebM, MKV) to an animated GIF entirely in your web browser using ffmpeg.wasm. No upload, no signup, no software install.",
    howToSteps: [
      {
        name: "Drop or pick your video",
        text: "Open vidsandgifs.com/tools/mp4-to-gif and drag a video file onto the dropzone, or click to pick one from your computer. The tool reads the file locally — nothing is uploaded.",
      },
      {
        name: "Wait for the encode",
        text: "ffmpeg.wasm runs a two-pass palette-optimized GIF encode in your browser tab. The first conversion downloads about 25 MB of WebAssembly; later conversions in the same session are instant.",
      },
      {
        name: "Download the GIF",
        text: "Click 'Download GIF' to save the converted file. The output is 480px wide at 12 fps with a custom 256-color palette — playable on every browser, chat app, and README.",
      },
    ],
    appFeatures: [
      "Convert MP4 / MOV / WebM / MKV to animated GIF entirely in the browser",
      "Two-pass palette-optimized encode for native-ffmpeg quality",
      "No file upload — privacy-preserving local conversion",
      "No signup, no watermark, no daily limit",
    ],
    breadcrumb: {
      home: "vids&gifs",
      tools: "Tools",
      here: "MP4 to GIF converter",
    },
    toolStrings: {
      badge: "ffmpeg in your browser · no upload",
      headlineBefore: "MP4 to GIF converter,",
      headlineHighlight: "free and instant",
      subtitle:
        "Drop a video, get an animated GIF — perfect for READMEs, chat reactions, and anywhere autoplay videos don't render. Conversion runs entirely in your browser; the file never leaves your machine.",
      dropzoneTitle: "Drop a video here or click to pick",
      dropzoneSubtitle:
        "Short clips work best — keep it under ~20 seconds for a snappy GIF.",
      notVideoError:
        "That doesn't look like a video. Drop an .mp4, .mov, .webm or .mkv file.",
      phaseLoading: "Loading ffmpeg",
      phaseEncoding: "Rendering GIF",
      phaseDone: "Done",
      phaseError: "Something went wrong",
      phaseIdle: "Drop a video",
      encodingHint:
        "Encoding entirely in your browser — feel free to keep scrolling.",
      resultBadge: "GIF ready",
      reset: "Reset",
      errorGeneric: "Something went wrong.",
      download: "Download GIF",
      convertAnother: "Convert another",
      step1Title: "Drop your video",
      step1Body:
        "Click the dropzone or drag an .mp4, .mov, .webm, or .mkv file. The tool reads it locally — nothing is uploaded.",
      step2Title: "Render the GIF",
      step2Body:
        "ffmpeg.wasm runs a two-pass palette-optimized GIF encode in your browser tab — quality matches native ffmpeg, not a plain single-pass converter.",
      step3Title: "Download the GIF",
      step3Body:
        "Save the file or drop it straight into a chat. Output is 480px wide at 12 fps — the sweet spot for size and smoothness.",
      localCallout:
        "<strong>100% local.</strong> The video never leaves your machine — the entire encode runs in this tab via ffmpeg.wasm.",
      previewAlt: "Converted GIF preview",
    },
  },
  uk: {
    title: "Конвертер MP4 у GIF — безкоштовно, у браузері, без завантаження",
    description:
      "Конвертуй MP4 (або MOV / WebM / MKV) у анімований GIF миттєво у браузері. Без завантаження, без водяних знаків, без реєстрації. На основі ffmpeg.wasm — твій файл не покидає пристрій.",
    ogTitle: "Конвертер MP4 у GIF — безкоштовно, у браузері",
    ogDescription:
      "Перетягни відео — отримай GIF. Двохпрохідний енкод з оптимізованою палітрою повністю у твоєму браузері через ffmpeg.wasm: без завантаження, без реєстрації, без водяних знаків.",
    whyHeading: "Навіщо перетворювати відео на GIF?",
    whyIntro:
      "GIF більший за еквівалентний MP4, але автовідтворюється без елементів керування, рендериться там, де відео не вантажиться, і читається як частина повідомлення. Для коротких реакцій, демо-петель і поверхонь, ворожих до вбудованого відео, GIF — досі правильний інструмент.",
    benefit: [
      {
        title: "Автовідтворення скрізь",
        body: "Жодної кнопки play, жодного узгодження кодеків, жодних правил автовідтворення, що б'ються з браузером. Кинь GIF у будь-який чат, README чи лист — він починає циклитися щойно завантажиться.",
      },
      {
        title: "Налаштована палітра",
        body: "Двохпрохідний енкод palettegen / paletteuse обирає найкращі 256 кольорів саме для твого кліпа — значно чистіше за однопрохідні конвертери з фіксованою «веб-безпечною» палітрою.",
      },
      {
        title: "Приватність за замовчуванням",
        body: "Конвертація відбувається у цій вкладці браузера через ffmpeg.wasm. Твоє відео ніколи не завантажується, не ставиться в чергу й не логується. Закрив вкладку — нічого не лишилося.",
      },
    ],
    whereHeading: "Де GIF досі виграє",
    uses: [
      {
        title: "GitHub README",
        body: "GitHub рендерить GIF інлайн у markdown. Відео показуються як посилання на завантаження. Якщо хочеш, щоб README демонстрував фічу, а не просив читача скачати кліп, GIF досі — відповідь.",
      },
      {
        title: "Підписи у листах і розсилки",
        body: "Більшість поштових клієнтів блокують HTML5-відео й вирізають половину сучасної розмітки. Анімований GIF — найменший спільний знаменник для інлайн-анімації, що насправді програється в Outlook, Gmail і Apple Mail.",
      },
      {
        title: "Гілки коментарів",
        body: "Reddit, Hacker News, Lobste.rs і більшість форумного ПЗ дозволяють вбудовані зображення, але не відео. GIF рендеряться там, де посилання на MP4 лежать без перегляду внизу гілки.",
      },
      {
        title: "Швидкі реакційні кліпи",
        body: "2-секундний реакційний GIF дає удар інлайн-анімації без перетягування плеєра у UI. Для кліпів коротших за 3 секунди аргумент розміру файлу для MP4 і так майже зникає.",
      },
    ],
    faqHeading: "Часті запитання",
    faq: [
      {
        question: "Конвертер MP4 у GIF справді безкоштовний?",
        answer:
          "Так. Жодної реєстрації, водяних знаків, денного ліміту чи платного тарифу. Уся конвертація працює у твоєму браузері, тому єдина витрата — твій процесор. На цій сторінці немає реклами.",
      },
      {
        question: "Чи завантажується моє відео кудись?",
        answer:
          "Ні. Конвертація відбувається локально у вкладці браузера через ffmpeg.wasm — WebAssembly-збірку того самого ffmpeg, що його використовують професійні відео-інструменти. Твій файл не завантажується, не копіюється на наші сервери, не логується. Можеш переконатися: відкрий DevTools → Network і подивись на конвертацію — для твого файлу немає жодних запитів.",
      },
      {
        question: "Які формати відео можна конвертувати?",
        answer:
          "MP4, MOV (QuickTime), WebM і MKV (Matroska) — чотири найпоширеніші відеоконтейнери. Інструмент перевіряє «магічні байти» кожного файлу до старту, тож перейменоване не-відео ловиться одразу й не валить енкодер.",
      },
      {
        question: "Навіщо конвертувати MP4 у GIF, якщо GIF більший?",
        answer:
          "GIF автовідтворюються без елементів керування, рендеряться нативно там, де відео не завантажується (GitHub README, RSS-читалки, деякі поштові клієнти, старі форуми, гілки з обмеженням вбудованого медіа), і відчуваються як частина повідомлення, а не плеєрний віджет. Це правильний інструмент для коротких реакційних кліпів, демо-петель у документації й чатів, де візуальний удар інлайн-анімації важливіший за розмір файлу.",
      },
      {
        question: "Який максимальний розмір файлу?",
        answer:
          "Жорсткого ліміту немає, але на практиці браузер починає буксувати після ~100 МБ — увесь файл має поміститися в пам'яті WebAssembly. Для найкращого результату тримай кліпи коротшими за 20 секунд: GIF швидко росте з тривалістю, а короткі кліпи виглядають як анімація, а не уповільнене відео.",
      },
      {
        question: "Яка роздільність і частота кадрів у GIF?",
        answer:
          "Вихід — 480 пікселів завширшки (зі збереженням пропорцій) при 12 кадрах/с. Це золота середина між розміром і плавністю — ширші GIF роздуваються в розмірі без помітного приросту якості, бо формат обмежений 256-колірною палітрою незалежно від роздільності.",
      },
      {
        question: "Конвертер використовує однопрохідну чи двохпрохідну палітру?",
        answer:
          "Двохпрохідну. ffmpeg.wasm спочатку запускає palettegen, щоб обчислити оптимальну 256-колірну палітру саме для твого кліпа, а потім paletteuse з Bayer-дізерингом для застосування. Результат значно чистіший за однопрохідні конвертери з фіксованою «веб-безпечною» палітрою — кольори виглядають як у джерелі, а не як скріншот робочого столу 1995 року.",
      },
      {
        question: "Чому перша конвертація триває довше за наступні?",
        answer:
          "Першого разу, коли ти конвертуєш щось у цій вкладці, браузер завантажує близько 25 МБ WebAssembly (ядро ffmpeg). Далі це кешується, і кожна наступна конвертація в тій самій сесії стартує миттєво. Якщо перезавантажиш сторінку чи відкриєш приватне вікно, завантаження повториться.",
      },
      {
        question: "Хочу зворотно — GIF у MP4. Куди?",
        answer:
          "Маємо окремий інструмент: vidsandgifs.com/uk/tools/gif-to-mp4. Перетягни свій GIF туди — отримаєш 480p MP4 зазвичай у 5–20 разів менший за оригінал.",
      },
    ],
    aboutBadge: "Про vids&gifs",
    aboutHeading: "Одна приватна бібліотека GIF і відео — у кожному чаті",
    aboutBody:
      "Цей конвертер — безкоштовний бічний інструмент. Основний продукт vids&gifs — приватна крос-чатова бібліотека: завантажуєш GIF і короткі відео один раз, і надсилаєш їх інлайн з будь-якого чату Telegram (@vidsandgifsbot) або каналу Discord (/gif). Жодних копіпастів посилань, жодного перебудовування папок під кожну платформу.",
    ctaSeeLibrary: "Як працює крос-чатова бібліотека →",
    ctaGifToMp4: "Конвертер GIF → MP4",
    ctaFaq: "Повний FAQ",
    howToName: "Як конвертувати MP4 у GIF у браузері",
    howToDescription:
      "Конвертуй будь-яке відео (MP4, MOV, WebM, MKV) у анімований GIF повністю у веб-браузері за допомогою ffmpeg.wasm. Без завантаження, без реєстрації, без встановлення ПЗ.",
    howToSteps: [
      {
        name: "Перетягни або обери відео",
        text: "Відкрий vidsandgifs.com/uk/tools/mp4-to-gif і перетягни відеофайл на зону, або клацни, щоб обрати з комп'ютера. Інструмент читає файл локально — нічого не завантажується.",
      },
      {
        name: "Зачекай на енкод",
        text: "ffmpeg.wasm запускає двохпрохідний GIF-енкод з оптимізованою палітрою у вкладці браузера. Перша конвертація завантажує близько 25 МБ WebAssembly; наступні в тій самій сесії — миттєві.",
      },
      {
        name: "Завантаж GIF",
        text: "Натисни «Завантажити GIF», щоб зберегти файл. Вихід — 480 пікселів завширшки при 12 кадрах/с з власною 256-колірною палітрою. Відтворюється у будь-якому браузері, месенджері й README.",
      },
    ],
    appFeatures: [
      "Конвертація MP4 / MOV / WebM / MKV у анімований GIF повністю у браузері",
      "Двохпрохідний енкод з оптимізованою палітрою для якості нативного ffmpeg",
      "Без завантаження файлу — приватна локальна конвертація",
      "Без реєстрації, без водяних знаків, без денного ліміту",
    ],
    breadcrumb: {
      home: "vids&gifs",
      tools: "Інструменти",
      here: "Конвертер MP4 у GIF",
    },
    toolStrings: {
      badge: "ffmpeg у твоєму браузері · без завантаження",
      headlineBefore: "Конвертер MP4 у GIF,",
      headlineHighlight: "безкоштовно й миттєво",
      subtitle:
        "Перетягни відео — отримай анімований GIF. Ідеально для README, реакцій у чатах і будь-де, де автовідтворюване відео не рендериться. Конвертація відбувається повністю у твоєму браузері; файл не покидає пристрій.",
      dropzoneTitle: "Перетягни відео сюди або клацни, щоб обрати",
      dropzoneSubtitle:
        "Короткі кліпи працюють найкраще — тримай тривалість до ~20 секунд для жвавого GIF.",
      notVideoError:
        "Це не схоже на відео. Перетягни .mp4, .mov, .webm або .mkv файл.",
      phaseLoading: "Завантаження ffmpeg",
      phaseEncoding: "Рендер GIF",
      phaseDone: "Готово",
      phaseError: "Щось пішло не так",
      phaseIdle: "Перетягни відео",
      encodingHint:
        "Кодування повністю у твоєму браузері — можеш гортати далі.",
      resultBadge: "GIF готовий",
      reset: "Скинути",
      errorGeneric: "Щось пішло не так.",
      download: "Завантажити GIF",
      convertAnother: "Конвертувати ще",
      step1Title: "Перетягни відео",
      step1Body:
        "Клацни на зону або перетягни .mp4, .mov, .webm чи .mkv. Інструмент читає файл локально — нічого не завантажується.",
      step2Title: "Рендер GIF",
      step2Body:
        "ffmpeg.wasm запускає двохпрохідний GIF-енкод з оптимізованою палітрою у вкладці браузера — якість на рівні нативного ffmpeg, а не звичайного однопрохідного конвертера.",
      step3Title: "Завантаж GIF",
      step3Body:
        "Збережи файл або кинь одразу в чат. Вихід — 480 пікселів завширшки при 12 кадрах/с — золота середина між розміром і плавністю.",
      localCallout:
        "<strong>100% локально.</strong> Відео не покидає твоєї машини — увесь енкод працює у цій вкладці через ffmpeg.wasm.",
      previewAlt: "Прев'ю сконвертованого GIF",
    },
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const c = COPY[locale];
  const url = absoluteUrl(LOCALE_PATH[locale]);
  return {
    title: c.title,
    description: c.description,
    alternates: {
      canonical: url,
      languages: {
        en: absoluteUrl(LOCALE_PATH.en),
        uk: absoluteUrl(LOCALE_PATH.uk),
        "x-default": absoluteUrl(LOCALE_PATH.en),
      },
    },
    openGraph: {
      type: "website",
      title: c.ogTitle,
      description: c.ogDescription,
      url,
      locale: locale === "uk" ? "uk_UA" : "en_US",
      alternateLocale: locale === "uk" ? ["en_US"] : ["uk_UA"],
    },
    twitter: {
      card: "summary_large_image",
      title: c.ogTitle,
      description: c.description,
    },
  };
}

export default async function Mp4ToGifPage() {
  const locale = await getServerLocale();
  const c = COPY[locale];
  const pageUrl = absoluteUrl(LOCALE_PATH[locale]);
  const otherLocale: Locale = locale === "uk" ? "en" : "uk";

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    inLanguage: locale,
    name: c.howToName,
    description: c.howToDescription,
    totalTime: "PT45S",
    step: c.howToSteps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${pageUrl}#step-${i + 1}`,
    })),
  };
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    inLanguage: locale,
    name: "vids&gifs " + c.breadcrumb.here,
    url: pageUrl,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any (browser-based)",
    browserRequirements:
      "Modern browser with JavaScript and WebAssembly enabled",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: c.appFeatures,
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: c.faq.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: c.breadcrumb.home,
        item: absoluteUrl(locale === "uk" ? "/uk" : "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: c.breadcrumb.tools,
        item: pageUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: c.breadcrumb.here,
        item: pageUrl,
      },
    ],
  };

  const homeUrl = locale === "uk" ? "/uk" : "/";
  const gifToMp4Url =
    locale === "uk" ? "/uk/tools/gif-to-mp4" : "/tools/gif-to-mp4";
  const faqUrl = locale === "uk" ? "/uk/faq" : "/faq";

  return (
    <Box>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(appJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 0 }}
      >
        <Mp4ToGifTool strings={c.toolStrings} />
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.whyHeading}
        </Heading>
        <Text as="p" color="gray" size="3" mb="5" style={{ maxWidth: 700 }}>
          {c.whyIntro}
        </Text>

        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          <BenefitCard
            Icon={LightningBoltIcon}
            title={c.benefit[0].title}
            body={c.benefit[0].body}
          />
          <BenefitCard
            Icon={StackIcon}
            title={c.benefit[1].title}
            body={c.benefit[1].body}
          />
          <BenefitCard
            Icon={LockClosedIcon}
            title={c.benefit[2].title}
            body={c.benefit[2].body}
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.whereHeading}
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <UseCaseCard
            Icon={CodeIcon}
            title={c.uses[0].title}
            body={c.uses[0].body}
          />
          <UseCaseCard
            Icon={EnvelopeClosedIcon}
            title={c.uses[1].title}
            body={c.uses[1].body}
          />
          <UseCaseCard
            Icon={ChatBubbleIcon}
            title={c.uses[2].title}
            body={c.uses[2].body}
          />
          <UseCaseCard
            Icon={PaperPlaneIcon}
            title={c.uses[3].title}
            body={c.uses[3].body}
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 3, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.faqHeading}
        </Heading>
        <Box style={{ maxWidth: 760 }}>
          {c.faq.map((entry) => (
            <Box
              key={entry.question}
              asChild
              mb="3"
              style={{
                border: "1px solid var(--gray-4)",
                borderRadius: "var(--radius-3)",
                padding: "12px 16px",
                background: "var(--gray-1)",
              }}
            >
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "var(--font-size-3)",
                    fontWeight: 500,
                    listStyle: "none",
                  }}
                >
                  {entry.question}
                </summary>
                <Text
                  as="p"
                  size="2"
                  mt="2"
                  style={{ color: "var(--gray-12)", lineHeight: 1.6 }}
                >
                  {entry.answer}
                </Text>
              </details>
            </Box>
          ))}
        </Box>
      </div>

      <Separator size="4" my="6" />

      <Flex
        direction="column"
        gap="3"
        align="start"
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 4, maxWidth: 760 }}
      >
        <Badge color="iris" variant="surface" radius="full">
          {c.aboutBadge}
        </Badge>
        <Heading as="h2" size="6" style={{ letterSpacing: "-0.02em" }}>
          {c.aboutHeading}
        </Heading>
        <Text as="p" color="gray" size="3" style={{ lineHeight: 1.6 }}>
          {c.aboutBody}
        </Text>
        <Flex gap="3" wrap="wrap" mt="2">
          <Link
            href={homeUrl}
            style={{
              color: "var(--accent-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {c.ctaSeeLibrary}
          </Link>
          <Link
            href={gifToMp4Url}
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {c.ctaGifToMp4}
          </Link>
          <Link
            href={faqUrl}
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {c.ctaFaq}
          </Link>
          <Link
            href={LOCALE_PATH[otherLocale]}
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {otherLocale === "uk" ? "Українською" : "English"}
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
}

function BenefitCard({
  Icon,
  title,
  body,
}: {
  Icon: typeof StackIcon;
  title: string;
  body: string;
}) {
  return (
    <Box
      style={{
        padding: "20px",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-5)",
        background:
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        height: "100%",
      }}
    >
      <Box
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background:
            "linear-gradient(135deg, var(--iris-4) 0%, var(--blue-4) 100%)",
          color: "var(--iris-11)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px var(--iris-6)",
          marginBottom: 12,
        }}
      >
        <Icon width="18" height="18" />
      </Box>
      <Heading as="h3" size="4" mb="2" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </Heading>
      <Text as="p" size="2" color="gray" style={{ lineHeight: 1.55 }}>
        {body}
      </Text>
    </Box>
  );
}

function UseCaseCard({
  Icon,
  title,
  body,
}: {
  Icon: typeof PaperPlaneIcon;
  title: string;
  body: string;
}) {
  return (
    <Flex
      gap="3"
      align="start"
      style={{
        padding: "16px 18px",
        borderRadius: "var(--radius-3)",
        border: "1px solid var(--gray-5)",
        background: "var(--gray-2)",
      }}
    >
      <Box
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          flexShrink: 0,
          background: "var(--accent-4)",
          color: "var(--accent-11)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon width="16" height="16" />
      </Box>
      <Box style={{ minWidth: 0 }}>
        <Heading as="h3" size="3" mb="1" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </Heading>
        <Text as="p" size="2" color="gray" style={{ lineHeight: 1.55 }}>
          {body}
        </Text>
      </Box>
    </Flex>
  );
}
