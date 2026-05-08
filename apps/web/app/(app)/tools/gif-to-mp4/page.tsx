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
  LightningBoltIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  ShadowIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import {
  GifToMp4Tool,
  type GifToMp4Strings,
} from "@/components/GifToMp4Tool";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

const PAGE_PATH = "/tools/gif-to-mp4";
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
  ctaMp4ToGif: string;
  ctaFaq: string;
  howToName: string;
  howToDescription: string;
  howToSteps: [HowToStep, HowToStep, HowToStep];
  appFeatures: string[];
  breadcrumb: { home: string; tools: string; here: string };
  toolStrings: GifToMp4Strings;
}

const COPY: Record<Locale, PageCopy> = {
  en: {
    title: "GIF to MP4 converter — free, in-browser, no upload",
    description:
      "Convert GIF to MP4 instantly in your browser. No upload, no watermark, no signup. Powered by ffmpeg.wasm — your file never leaves your device.",
    ogTitle: "GIF to MP4 converter — free, in-browser",
    ogDescription:
      "Drop a GIF, get an MP4. Runs entirely in your browser via ffmpeg.wasm — no upload, no signup, no watermark. Typically 5–20× smaller than the source GIF.",
    whyHeading: "Why convert GIFs to MP4?",
    whyIntro:
      "GIF is a 35-year-old image format that every chat app secretly re-encodes anyway. Converting yourself keeps you in control of the quality, the framerate, and the file you actually share.",
    benefit: [
      {
        title: "5–20× smaller files",
        body: "An H.264 MP4 of the same clip is dramatically smaller than the GIF source — friendlier on data plans, faster on bad Wi-Fi, and within message-size limits that GIFs blow past.",
      },
      {
        title: "Smoother playback",
        body: "GIFs are capped at a 256-color palette and dither aggressively. MP4 keeps full color and plays at any framerate the source contains, without the banded look.",
      },
      {
        title: "Privacy by default",
        body: "The conversion runs in this browser tab using ffmpeg.wasm. Your GIF is never uploaded, never queued, never logged. Close the tab and nothing remains.",
      },
    ],
    whereHeading: "Where MP4 wins over GIF",
    uses: [
      {
        title: "Telegram",
        body: "Telegram silently converts every GIF you upload to MP4 before sending. Doing it yourself means the chat shows the version you chose, not the version Telegram's auto-encoder produced.",
      },
      {
        title: "Discord",
        body: "Discord caps free-tier uploads at 25 MB per message. A 40 MB reaction GIF won't send — but the same clip as a 3 MB MP4 sails through, no Nitro required.",
      },
      {
        title: "Twitter / X",
        body: "X re-encodes uploaded GIFs to MP4 server-side and the result is often blocky. Uploading an MP4 directly skips the pipeline and preserves your original quality.",
      },
      {
        title: "Web pages",
        body: "Replacing autoplay GIFs with looping MP4s (loop muted playsinline) cuts page weight by 80–95%. Web Vitals scores notice; mobile users notice more.",
      },
    ],
    faqHeading: "Frequently asked questions",
    faq: [
      {
        question: "Is the GIF to MP4 converter really free?",
        answer:
          "Yes. There's no signup, no watermark, no daily limit, and no paid tier on this tool. The entire conversion runs in your browser, so the only cost to anyone is your CPU. We don't show ads on this page.",
      },
      {
        question: "Does my GIF get uploaded anywhere?",
        answer:
          "No. The conversion happens locally inside your browser tab using ffmpeg.wasm — a WebAssembly build of the same ffmpeg used by professional video tooling. Your file is never uploaded, never copied to our servers, and never logged. You can verify by opening DevTools → Network and watching the conversion: there are no requests for your file.",
      },
      {
        question: "Why convert a GIF to MP4 in the first place?",
        answer:
          "MP4 is dramatically smaller (typically 5–20× smaller for the same clip), supports a full color palette instead of GIF's 256 colors, plays smoother on phones, and is what every modern messaging platform actually wants — Twitter/X, Telegram, Discord, WhatsApp and others all silently re-encode uploaded GIFs to MP4 anyway. Doing the conversion yourself means you keep control of the quality and the framerate.",
      },
      {
        question: "What's the maximum file size?",
        answer:
          "There's no hard cap, but in practice browsers struggle past ~100 MB because the entire file has to fit in WebAssembly memory. Most GIFs are small — the converter handles typical reaction GIFs (1–10 MB) instantly. Very long animations (10+ seconds at high resolution) may take a minute on slower laptops.",
      },
      {
        question: "Does the MP4 keep the audio from the GIF?",
        answer:
          "GIFs don't have audio — the format doesn't support an audio track at all. The MP4 we generate is silent, which is exactly what every chat app expects when you embed a converted GIF.",
      },
      {
        question: "Why does the first conversion take longer than the rest?",
        answer:
          "The first time you convert anything in this tab, the browser downloads about 25 MB of WebAssembly (the ffmpeg core). After that it's cached, and every subsequent conversion in the same session starts instantly. If you reload the page or open a private window, the download repeats.",
      },
      {
        question: "What resolution and codec does the output use?",
        answer:
          "The output is H.264 video at 480p with the +faststart flag, in an MP4 container. H.264 is the most universally compatible codec — every browser, phone, smart TV, and chat app supports it without plugins. 480p is high enough that GIF source detail is preserved (most GIFs are below 480p anyway) while keeping file size minimal.",
      },
      {
        question: "How does this compare to a server-side converter like ezgif?",
        answer:
          "Server-side converters require uploading your file, waiting in a queue, and downloading the result — three round trips that take longer than the actual conversion on a modern laptop. They also store your uploads (sometimes for days) and serve ads against them. Running the conversion in your browser skips all of that. The only thing you give up is the ability to convert files larger than your device can hold in memory.",
      },
      {
        question: "I want to do the reverse — MP4 to GIF. Where?",
        answer:
          "We have a dedicated tool for that at vidsandgifs.com/tools/mp4-to-gif. Drop your video there and get a 480px-wide animated GIF with a custom 256-color palette.",
      },
    ],
    aboutBadge: "About vids&gifs",
    aboutHeading:
      "One private library of GIFs and videos, sendable from every chat",
    aboutBody:
      "This converter is a free side-tool. The main vids&gifs product is a private, cross-chat library: upload your GIFs and short videos once, and send them inline from any Telegram chat (@vidsandgifsbot) or any Discord channel (/gif) — no copy-pasting links, no rebuilding folders per platform.",
    ctaSeeLibrary: "See how the cross-chat library works →",
    ctaMp4ToGif: "MP4 → GIF converter",
    ctaFaq: "Read the full FAQ",
    howToName: "How to convert a GIF to MP4 in your browser",
    howToDescription:
      "Convert any GIF to an MP4 video file entirely in your web browser using ffmpeg.wasm. No upload, no signup, no software install.",
    howToSteps: [
      {
        name: "Drop or pick your GIF",
        text: "Open vidsandgifs.com/tools/gif-to-mp4 and drag a .gif file onto the dropzone, or click to pick one from your computer. The tool reads the file locally — nothing is uploaded.",
      },
      {
        name: "Wait for the encode",
        text: "ffmpeg.wasm runs an H.264 transcode in your browser tab. The first conversion downloads about 25 MB of WebAssembly; later conversions in the same session are instant.",
      },
      {
        name: "Download the MP4",
        text: "Click 'Download MP4' to save the converted file. The output is silent 480p H.264 in an MP4 container — playable on every modern browser, phone, and chat app.",
      },
    ],
    appFeatures: [
      "Convert GIF files to MP4 (H.264) entirely in the browser",
      "No file upload — privacy-preserving local conversion",
      "No signup, no watermark, no daily limit",
      "Silent MP4 output with +faststart for instant streaming",
    ],
    breadcrumb: {
      home: "vids&gifs",
      tools: "Tools",
      here: "GIF to MP4 converter",
    },
    toolStrings: {
      badge: "ffmpeg in your browser · no upload",
      headlineBefore: "GIF to MP4 converter,",
      headlineHighlight: "free and instant",
      subtitle:
        "Drop a GIF, get an MP4 — typically 5–20× smaller and far smoother on mobile. Conversion runs entirely in your browser; the file never leaves your machine.",
      dropzoneTitle: "Drop a .gif here or click to pick",
      dropzoneSubtitle:
        "Up to ~50 MB works smoothly. Your file stays on this device.",
      notGifError: "That doesn't look like a GIF. Drop a .gif file.",
      phaseLoading: "Loading ffmpeg",
      phaseEncoding: "Encoding MP4",
      phaseDone: "Done",
      phaseError: "Something went wrong",
      phaseIdle: "Drop a GIF",
      encodingHint:
        "Encoding entirely in your browser — feel free to keep scrolling.",
      resultBadge: "MP4 ready",
      smallerSuffix: "% smaller",
      reset: "Reset",
      errorGeneric: "Something went wrong.",
      download: "Download MP4",
      convertAnother: "Convert another",
      step1Title: "Drop your GIF",
      step1Body:
        "Click the dropzone or drag a .gif from your desktop. Files are read locally — nothing is uploaded.",
      step2Title: "Encode in your browser",
      step2Body:
        "ffmpeg.wasm runs the H.264 transcode on this tab. First conversion downloads ~25 MB of WASM; subsequent ones are instant.",
      step3Title: "Download the MP4",
      step3Body:
        "Save the file or play it inline. The MP4 is silent (GIFs have no audio) and 480p H.264 — plays everywhere.",
      localCallout:
        "<strong>100% local.</strong> The GIF never leaves your machine — the entire encode runs in this tab via ffmpeg.wasm.",
    },
  },
  uk: {
    title: "Конвертер GIF у MP4 — безкоштовно, у браузері, без завантаження",
    description:
      "Конвертуй GIF у MP4 миттєво у своєму браузері. Без завантаження, без водяних знаків, без реєстрації. На основі ffmpeg.wasm — твій файл не покидає пристрій.",
    ogTitle: "Конвертер GIF у MP4 — безкоштовно, у браузері",
    ogDescription:
      "Перетягни GIF — отримай MP4. Працює повністю у твоєму браузері через ffmpeg.wasm: без завантаження, без реєстрації, без водяних знаків. Зазвичай у 5–20 разів менший за оригінал.",
    whyHeading: "Навіщо конвертувати GIF у MP4?",
    whyIntro:
      "GIF — формат зображення віком 35 років, який кожен месенджер усе одно мовчки перекодовує. Конвертація вручну дає тобі контроль над якістю, частотою кадрів і файлом, який ти насправді надсилаєш.",
    benefit: [
      {
        title: "У 5–20 разів менші файли",
        body: "MP4 у H.264 для того ж кліпа драматично менший за GIF — дружній до тарифів, швидший на поганому Wi-Fi і влазить у ліміти повідомлень, які GIF перевищує.",
      },
      {
        title: "Плавніше відтворення",
        body: "GIF обмежений палітрою з 256 кольорів і агресивно дізерингує. MP4 зберігає повний колір і відтворюється з будь-якою частотою кадрів джерела — без смугастого вигляду.",
      },
      {
        title: "Приватність за замовчуванням",
        body: "Конвертація відбувається у цій вкладці браузера через ffmpeg.wasm. Твій GIF ніколи не завантажується, не ставиться в чергу й не логується. Закрив вкладку — нічого не лишилося.",
      },
    ],
    whereHeading: "Де MP4 виграє у GIF",
    uses: [
      {
        title: "Telegram",
        body: "Telegram мовчки перекодовує кожен GIF, який ти завантажуєш, у MP4 перед надсиланням. Зробивши це сам, ти показуєш у чаті ту версію, яку обрав, а не ту, що зробив авто-енкодер Telegram.",
      },
      {
        title: "Discord",
        body: "Discord обмежує безкоштовні завантаження 25 МБ на повідомлення. GIF із реакцією на 40 МБ не пройде — а той самий кліп як 3 МБ MP4 надішлеться без Nitro.",
      },
      {
        title: "Twitter / X",
        body: "X перекодовує завантажені GIF у MP4 на сервері, і результат часто пікселізований. Завантаження MP4 напряму обходить пайплайн і зберігає оригінальну якість.",
      },
      {
        title: "Веб-сторінки",
        body: "Заміна автовідтворюваних GIF на зацикловані MP4 (loop muted playsinline) скорочує вагу сторінки на 80–95%. Web Vitals помічають; мобільні користувачі — більше.",
      },
    ],
    faqHeading: "Часті запитання",
    faq: [
      {
        question: "Конвертер GIF у MP4 справді безкоштовний?",
        answer:
          "Так. Жодної реєстрації, водяних знаків, денного ліміту чи платного тарифу. Уся конвертація працює у твоєму браузері, тому єдина витрата — твій процесор. На цій сторінці немає реклами.",
      },
      {
        question: "Чи завантажується мій GIF кудись?",
        answer:
          "Ні. Конвертація відбувається локально у вкладці браузера через ffmpeg.wasm — WebAssembly-збірку того самого ffmpeg, що його використовують професійні відео-інструменти. Твій файл не завантажується, не копіюється на наші сервери, не логується. Можеш переконатися: відкрий DevTools → Network і подивись на конвертацію — для твого файлу немає жодних запитів.",
      },
      {
        question: "Навіщо взагалі конвертувати GIF у MP4?",
        answer:
          "MP4 значно менший (зазвичай у 5–20 разів менший за той самий кліп), підтримує повну колірну палітру замість 256 кольорів GIF, плавніше відтворюється на телефонах, і це те, чого насправді хочуть усі сучасні платформи: Twitter/X, Telegram, Discord, WhatsApp і інші мовчки перекодовують завантажені GIF у MP4. Робити конвертацію самостійно означає тримати під контролем якість і частоту кадрів.",
      },
      {
        question: "Який максимальний розмір файлу?",
        answer:
          "Жорсткого ліміту немає, але на практиці браузер починає буксувати після ~100 МБ — увесь файл має поміститися в пам'яті WebAssembly. Більшість GIF малі: типові реакційні гіфки (1–10 МБ) конвертер обробляє миттєво. Дуже довгі анімації (10+ секунд у високій роздільності) можуть зайняти хвилину на повільному ноутбуці.",
      },
      {
        question: "Чи зберігає MP4 аудіо з GIF?",
        answer:
          "GIF не має аудіо — формат взагалі не підтримує аудіодоріжку. Згенерований MP4 безшумний, що саме й потрібно кожному месенджеру при вбудовуванні сконвертованого GIF.",
      },
      {
        question: "Чому перша конвертація триває довше за наступні?",
        answer:
          "Першого разу, коли ти конвертуєш щось у цій вкладці, браузер завантажує близько 25 МБ WebAssembly (ядро ffmpeg). Далі це кешується, і кожна наступна конвертація в тій самій сесії стартує миттєво. Якщо перезавантажиш сторінку чи відкриєш приватне вікно, завантаження повториться.",
      },
      {
        question: "Яка роздільність і кодек у вихідного файлу?",
        answer:
          "Вихід — H.264 у 480p з прапорцем +faststart, у контейнері MP4. H.264 — найуніверсальніший кодек: кожен браузер, телефон, смарт-ТВ і месенджер підтримує його без плагінів. 480p достатньо, щоб зберегти деталі GIF (більшість GIF і так нижче 480p), і водночас тримає розмір файлу мінімальним.",
      },
      {
        question: "Як це порівнюється з серверним конвертером на кшталт ezgif?",
        answer:
          "Серверні конвертери вимагають завантажити файл, чекати в черзі та скачати результат — три «круги» туди-сюди, які займають довше, ніж сама конвертація на сучасному ноутбуці. Вони ще й зберігають твої завантаження (іноді на дні) і показують рекламу проти них. Конвертація у браузері пропускає все це. Єдине, чим жертвуєш — здатністю конвертувати файли, більші за пам'ять твого пристрою.",
      },
      {
        question: "Хочу зворотно — MP4 у GIF. Куди?",
        answer:
          "Маємо окремий інструмент: vidsandgifs.com/uk/tools/mp4-to-gif. Перетягни своє відео туди — отримаєш GIF шириною 480 пікселів із власною 256-колірною палітрою.",
      },
    ],
    aboutBadge: "Про vids&gifs",
    aboutHeading:
      "Одна приватна бібліотека GIF і відео — у кожному чаті",
    aboutBody:
      "Цей конвертер — безкоштовний бічний інструмент. Основний продукт vids&gifs — приватна крос-чатова бібліотека: завантажуєш GIF і короткі відео один раз, і надсилаєш їх інлайн з будь-якого чату Telegram (@vidsandgifsbot) або каналу Discord (/gif). Жодних копіпастів посилань, жодного перебудовування папок під кожну платформу.",
    ctaSeeLibrary: "Як працює крос-чатова бібліотека →",
    ctaMp4ToGif: "Конвертер MP4 → GIF",
    ctaFaq: "Повний FAQ",
    howToName: "Як конвертувати GIF у MP4 у браузері",
    howToDescription:
      "Конвертуй будь-який GIF у MP4 повністю у веб-браузері за допомогою ffmpeg.wasm. Без завантаження, без реєстрації, без встановлення ПЗ.",
    howToSteps: [
      {
        name: "Перетягни або обери GIF",
        text: "Відкрий vidsandgifs.com/uk/tools/gif-to-mp4 і перетягни .gif на зону, або клацни, щоб обрати файл з комп'ютера. Інструмент читає файл локально — нічого не завантажується.",
      },
      {
        name: "Зачекай на енкод",
        text: "ffmpeg.wasm запускає H.264-транскод у вкладці браузера. Перша конвертація завантажує близько 25 МБ WebAssembly; наступні в тій самій сесії — миттєві.",
      },
      {
        name: "Завантаж MP4",
        text: "Натисни «Завантажити MP4», щоб зберегти файл. Вихід — безшумний 480p H.264 у контейнері MP4: відтворюється у будь-якому сучасному браузері, телефоні чи месенджері.",
      },
    ],
    appFeatures: [
      "Конвертація GIF у MP4 (H.264) повністю у браузері",
      "Без завантаження файлу — приватна локальна конвертація",
      "Без реєстрації, без водяних знаків, без денного ліміту",
      "Безшумний MP4 з +faststart для миттєвого стрімінгу",
    ],
    breadcrumb: {
      home: "vids&gifs",
      tools: "Інструменти",
      here: "Конвертер GIF у MP4",
    },
    toolStrings: {
      badge: "ffmpeg у твоєму браузері · без завантаження",
      headlineBefore: "Конвертер GIF у MP4,",
      headlineHighlight: "безкоштовно й миттєво",
      subtitle:
        "Перетягни GIF — отримай MP4. Зазвичай у 5–20 разів менше за оригінал і набагато плавніше на мобільному. Конвертація відбувається повністю у твоєму браузері; файл не покидає пристрій.",
      dropzoneTitle: "Перетягни .gif сюди або клацни, щоб обрати",
      dropzoneSubtitle:
        "До ~50 МБ працює плавно. Файл залишається на твоєму пристрої.",
      notGifError: "Це не схоже на GIF. Перетягни .gif файл.",
      phaseLoading: "Завантаження ffmpeg",
      phaseEncoding: "Кодування MP4",
      phaseDone: "Готово",
      phaseError: "Щось пішло не так",
      phaseIdle: "Перетягни GIF",
      encodingHint:
        "Кодування повністю у твоєму браузері — можеш гортати далі.",
      resultBadge: "MP4 готовий",
      smallerSuffix: "% менший",
      reset: "Скинути",
      errorGeneric: "Щось пішло не так.",
      download: "Завантажити MP4",
      convertAnother: "Конвертувати ще",
      step1Title: "Перетягни свій GIF",
      step1Body:
        "Клацни на зону або перетягни .gif з робочого столу. Файли читаються локально — нічого не завантажується.",
      step2Title: "Кодування у браузері",
      step2Body:
        "ffmpeg.wasm запускає H.264-транскод у цій вкладці. Перша конвертація завантажує ~25 МБ WASM; наступні — миттєві.",
      step3Title: "Завантаж MP4",
      step3Body:
        "Збережи файл або відтвори одразу. MP4 безшумний (GIF не мають звуку), 480p H.264 — відтворюється скрізь.",
      localCallout:
        "<strong>100% локально.</strong> GIF не покидає твоєї машини — увесь енкод працює у цій вкладці через ffmpeg.wasm.",
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

export default async function GifToMp4Page() {
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
    totalTime: "PT30S",
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
  const mp4ToGifUrl =
    locale === "uk" ? "/uk/tools/mp4-to-gif" : "/tools/mp4-to-gif";
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
        <GifToMp4Tool strings={c.toolStrings} />
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
            Icon={StackIcon}
            title={c.benefit[0].title}
            body={c.benefit[0].body}
          />
          <BenefitCard
            Icon={LightningBoltIcon}
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
            Icon={PaperPlaneIcon}
            title={c.uses[0].title}
            body={c.uses[0].body}
          />
          <UseCaseCard
            Icon={ChatBubbleIcon}
            title={c.uses[1].title}
            body={c.uses[1].body}
          />
          <UseCaseCard
            Icon={ShadowIcon}
            title={c.uses[2].title}
            body={c.uses[2].body}
          />
          <UseCaseCard
            Icon={LightningBoltIcon}
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
            href={mp4ToGifUrl}
            style={{
              color: "var(--gray-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {c.ctaMp4ToGif}
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
