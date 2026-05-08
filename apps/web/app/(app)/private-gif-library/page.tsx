import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Separator,
  Text,
} from "@radix-ui/themes";
import {
  ArchiveIcon,
  ChatBubbleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MixIcon,
  PaperPlaneIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { absoluteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import { AnonChatLibraryHero } from "@/components/AnonChatLibraryHero";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

const PAGE_PATH = "/private-gif-library";
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

interface ChatEntry {
  title: string;
  steps: string[];
}

interface HowToStep {
  name: string;
  text: string;
  url: string;
}

interface PageCopy {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  oneLibHeading: string;
  oneLibIntro: string;
  benefits: [CardEntry, CardEntry, CardEntry];
  howChatHeading: string;
  chats: [ChatEntry, ChatEntry];
  freeHeading: string;
  free: [CardEntry, CardEntry, CardEntry, CardEntry];
  ctaHeading: string;
  ctaBody: string;
  ctaSignup: string;
  ctaSignin: string;
  faqHeading: string;
  faq: FaqEntry[];
  moreBadge: string;
  moreHeading: string;
  moreBody: string;
  ctaGifToMp4: string;
  ctaMp4ToGif: string;
  ctaFaq: string;
  howToName: string;
  howToDescription: string;
  howToSteps: HowToStep[];
  appName: string;
  appFeatures: string[];
  breadcrumb: { home: string; here: string };
}

const COPY: Record<Locale, PageCopy> = {
  en: {
    title:
      "Private GIF library — one shared library across Telegram and Discord",
    description:
      "Build a private library of GIFs and videos and send them inline from any Telegram or Discord chat — same folder, same search, every chat. Free.",
    ogTitle:
      "Private GIF library — one library, every chat (Telegram + Discord)",
    ogDescription:
      "Upload your GIFs and videos once. Send them inline from any Telegram chat (@vidsandgifsbot) or Discord channel (/gif). Private folders, scoped search, instant sharing.",
    oneLibHeading: "One library, every chat — that's the whole point",
    oneLibIntro:
      "Tenor and Giphy serve everyone the same public catalog. Telegram's saved-GIF list lives only inside Telegram. Your vids&gifs library is yours, organized into folders, and the same data backs inline pickers in both Telegram and Discord — no copies, no per-platform rebuilds.",
    benefits: [
      {
        title: "Private folders",
        body: "Group GIFs and videos by theme — work, friends, a specific group joke. The 'active' folder you pick on the website is exactly what the bots search inside.",
      },
      {
        title: "Scoped search",
        body: "Tag-based search runs against your folder, not a public catalog. Type three letters in the Telegram inline picker; the right reaction is one tap away.",
      },
      {
        title: "Read-only sharing",
        body: "Send a friend a share link to a folder. They see your collection live as you add to it, no copies and no manual sync. Perfect for a curated group library.",
      },
    ],
    howChatHeading: "How it works in each chat",
    chats: [
      {
        title: "Telegram",
        steps: [
          "In any chat, type @vidsandgifsbot followed by a search term.",
          "Telegram's native inline picker shows a grid of GIFs from your active folder.",
          "Tap one — it sends instantly, sourced from your private library, not Tenor.",
          "Forward any GIF to the bot to add it to your active folder.",
        ],
      },
      {
        title: "Discord",
        steps: [
          "Add the vids&gifs bot to your server (or use it in a DM).",
          "Type /gif and start typing a search term — slash autocomplete shows your folder.",
          "Pick one and the bot posts it to the channel.",
          "Use /upload-file to add a new GIF without leaving Discord.",
        ],
      },
    ],
    freeHeading: "What you get on the free tier",
    free: [
      {
        title: "Private by default",
        body: "Folders are private until you explicitly share them. Uploading a GIF doesn't publish it — your library is yours.",
      },
      {
        title: "Auto-file from chats",
        body: "Forward any GIF to @vidsandgifsbot or use Discord's /upload-file. The clip lands in your active folder and is searchable from every chat in seconds.",
      },
      {
        title: "Tag and search",
        body: "Tag GIFs once and the bots match against tags, not just filename. Three-letter searches in the inline picker hit the right clip the first time.",
      },
      {
        title: "Read-only share links",
        body: "Hand a friend a link and they get live read-only access to a folder — the bots search through their account but find your set.",
      },
    ],
    ctaHeading: "Build your library in 5 minutes",
    ctaBody:
      "Sign up, drag a few GIFs in, connect Telegram and Discord, and the inline picker is yours in every chat. No payment information, no mandatory plan.",
    ctaSignup: "Create a free account",
    ctaSignin: "Sign in",
    faqHeading: "Frequently asked questions",
    faq: [
      {
        question: "What is a private GIF library?",
        answer:
          "A private library is a personal collection of GIFs and short videos that only you can see and search. Unlike Tenor or Giphy — which serve everyone the same public catalog — a private library contains exactly the reactions, jokes, and clips you've curated. On vids&gifs your library lives in folders you control, and the same library powers the Telegram inline picker and the Discord /gif autocomplete, so you don't have to maintain a separate set per platform.",
      },
      {
        question: "How is this different from Telegram's built-in GIF saved list?",
        answer:
          "Telegram's saved-GIF list is per-account, lives only inside Telegram, and has no folders, no search beyond filename, and no way to share it with a friend. Your vids&gifs library is folder-based (you can keep separate sets for separate chats), tag-searchable, and accessible from a website, Telegram, and Discord with the same data backing all three. If you switch phones or sign in on a new device, everything is still there — and you can grant a friend read-only access to a folder so they can use your collection without rebuilding it themselves.",
      },
      {
        question: "How do I send GIFs inline in Telegram?",
        answer:
          "Connect your Telegram account once in Settings → Connections, then in any chat type @vidsandgifsbot followed by a search term. Telegram's native inline picker pops up a grid of GIFs from your active folder — tap one and it sends instantly. Forwarding any GIF to the bot adds it to that same folder, so your library grows from inside the chat.",
      },
      {
        question: "How do I send GIFs inline in Discord?",
        answer:
          "Add the vids&gifs Discord bot to your server (or use it in a DM), connect your account in Settings → Connections, and type /gif. Discord's slash-command autocomplete shows GIFs from your active folder as you type — pick one and the bot posts it to the channel. Use /upload-file to add a new GIF straight from Discord; it lands in your active folder and stays searchable on the website too.",
      },
      {
        question: "What's an active folder, and why does it matter?",
        answer:
          "You can keep multiple folders (work GIFs, friends GIFs, a specific group joke, etc.) and pick one as 'active' at any time. The active folder is the search scope for the Telegram inline picker and the Discord /gif autocomplete. So when you switch from a work chat to a friends chat, you flip your active folder once on the website, and both bots immediately start surfacing the right set of reactions.",
      },
      {
        question: "Can I share a folder with friends?",
        answer:
          "Yes. Open any folder and hit Share — that produces a read-only link. Anyone with the link sees your folder live as you add to it, with no copies and no manual sync. Their copy stays in sync automatically. Great for a friend group that wants a shared reaction library curated by one person.",
      },
      {
        question: "Is my library actually private?",
        answer:
          "Yes. Your folders default to private — only you and accounts you've explicitly shared a folder with can see what's inside. Uploading something to your library does not publish it. The only way a GIF becomes public is if you manually flip the visibility on the upload itself.",
      },
      {
        question: "Is this free?",
        answer:
          "Yes. Building folders, connecting Telegram and Discord, sending inline GIFs, sharing folders, and uploading new media all work on the free tier. A paid Pro tier exists for higher daily upload quotas, but every cross-chat library feature is on the free plan with no advertising.",
      },
      {
        question: "What if I just want to convert a GIF to MP4 (or back)?",
        answer:
          "We have free standalone tools for that — no signup needed. Use the GIF → MP4 converter at vidsandgifs.com/tools/gif-to-mp4 or the MP4 → GIF converter at vidsandgifs.com/tools/mp4-to-gif. Both run entirely in your browser via ffmpeg.wasm; the file never leaves your device.",
      },
    ],
    moreBadge: "More",
    moreHeading: "Free side-tools",
    moreBody:
      "Need to convert a clip before you upload it to your library? We have two free standalone converters that run entirely in your browser — no signup, no upload.",
    ctaGifToMp4: "GIF → MP4 converter →",
    ctaMp4ToGif: "MP4 → GIF converter →",
    ctaFaq: "Read the full FAQ",
    howToName:
      "How to set up a private GIF library across Telegram and Discord",
    howToDescription:
      "Sign up for vids&gifs, connect Telegram and Discord, upload your GIFs into folders, and send them inline from any chat with @vidsandgifsbot or /gif.",
    howToSteps: [
      {
        name: "Create a free account",
        text: "Sign up at vidsandgifs.com/signup. No credit card required — every cross-chat library feature is on the free plan.",
        url: "/signup",
      },
      {
        name: "Upload your GIFs into folders",
        text: "Drag GIFs and short videos into the dashboard. Group them into folders by theme — work, friends, a specific group chat — and pick one as your 'active' folder.",
        url: "/folders",
      },
      {
        name: "Connect Telegram",
        text: "In Settings → Connections, link @vidsandgifsbot to your account. From any Telegram chat type '@vidsandgifsbot search-term' to inline-pick a GIF from your active folder.",
        url: "/settings",
      },
      {
        name: "Connect Discord",
        text: "Add the vids&gifs Discord bot to your server (or DM it) and link your account. Use /gif to autocomplete from your active folder, or /upload-file to add new media without leaving Discord.",
        url: "/settings",
      },
    ],
    appName: "vids&gifs — private GIF library for Telegram and Discord",
    appFeatures: [
      "Private GIF and video library, organized into folders",
      "Inline GIF picker in Telegram via @vidsandgifsbot",
      "Inline GIF autocomplete in Discord via /gif slash command",
      "Read-only folder sharing with live updates",
      "Tag-based search, scoped to your active folder",
      "Forward any GIF to the bot to add it to your active folder",
    ],
    breadcrumb: {
      home: "vids&gifs",
      here: "Private GIF library",
    },
  },
  uk: {
    title:
      "Приватна бібліотека GIF — одна спільна бібліотека для Telegram і Discord",
    description:
      "Збери приватну бібліотеку GIF і відео й надсилай їх інлайн з будь-якого чату Telegram або Discord — та сама папка, той самий пошук, у кожному чаті. Безкоштовно.",
    ogTitle:
      "Приватна бібліотека GIF — одна бібліотека, кожен чат (Telegram + Discord)",
    ogDescription:
      "Завантаж GIF і відео один раз. Надсилай їх інлайн з будь-якого чату Telegram (@vidsandgifsbot) або каналу Discord (/gif). Приватні папки, обмежений пошук, миттєвий шеринг.",
    oneLibHeading: "Одна бібліотека, кожен чат — у цьому й уся суть",
    oneLibIntro:
      "Tenor і Giphy показують усім той самий публічний каталог. Збережені GIF у Telegram живуть тільки в Telegram. Твоя бібліотека vids&gifs — твоя, структурована в папки, і ті самі дані живлять інлайн-пікери у Telegram і Discord. Жодних копій, жодних перебудовувань під кожну платформу.",
    benefits: [
      {
        title: "Приватні папки",
        body: "Групуй GIF і відео за темою — робота, друзі, окремий жарт у групі. «Активна» папка, яку ти обираєш на сайті, — саме та, у якій шукають боти.",
      },
      {
        title: "Обмежений пошук",
        body: "Тегований пошук працює по твоїй папці, а не по публічному каталогу. Набираєш три літери в інлайн-пікері Telegram — потрібна реакція за один тап.",
      },
      {
        title: "Read-only шеринг",
        body: "Надішли другу посилання на папку. Він бачить твою колекцію live, поки ти її поповнюєш, без копій і ручної синхронізації. Ідеально для дружньої групи з куратором.",
      },
    ],
    howChatHeading: "Як це працює у кожному чаті",
    chats: [
      {
        title: "Telegram",
        steps: [
          "У будь-якому чаті набираєш @vidsandgifsbot і пошуковий запит.",
          "Telegram показує нативну інлайн-сітку з GIF твоєї активної папки.",
          "Тапаєш на один — він одразу надсилається, з твоєї приватної бібліотеки, не з Tenor.",
          "Перешли будь-який GIF боту, щоб додати його до активної папки.",
        ],
      },
      {
        title: "Discord",
        steps: [
          "Додай бота vids&gifs на сервер (або користуйся в DM).",
          "Набери /gif і починай вводити запит — слеш-автодоповнення показує твою папку.",
          "Обери один — бот опублікує його в каналі.",
          "Використовуй /upload-file, щоб додати новий GIF, не виходячи з Discord.",
        ],
      },
    ],
    freeHeading: "Що ти отримуєш на безкоштовному тарифі",
    free: [
      {
        title: "Приватність за замовчуванням",
        body: "Папки приватні, поки ти явно ними не поділишся. Завантаження GIF не робить його публічним — твоя бібліотека твоя.",
      },
      {
        title: "Авто-додавання з чатів",
        body: "Перешли будь-який GIF на @vidsandgifsbot або використай /upload-file у Discord. Кліп потрапляє в активну папку й стає шукабельним з кожного чату за секунди.",
      },
      {
        title: "Теги і пошук",
        body: "Тегаєш GIF один раз — боти матчать по тегах, а не лише по імені файлу. Тризначні пошуки в інлайн-пікері знаходять потрібний кліп з першого разу.",
      },
      {
        title: "Read-only посилання",
        body: "Даєш другу посилання — він отримує live read-only доступ до папки. Боти шукають через його акаунт, але знаходять твій набір.",
      },
    ],
    ctaHeading: "Збери свою бібліотеку за 5 хвилин",
    ctaBody:
      "Зареєструйся, перетягни кілька GIF, підʼєднай Telegram і Discord — і інлайн-пікер твій у кожному чаті. Без платіжних даних, без обовʼязкового плану.",
    ctaSignup: "Створити безкоштовний акаунт",
    ctaSignin: "Увійти",
    faqHeading: "Часті запитання",
    faq: [
      {
        question: "Що таке приватна бібліотека GIF?",
        answer:
          "Приватна бібліотека — це особиста колекція GIF і коротких відео, яку бачиш і шукаєш лише ти. На відміну від Tenor чи Giphy, що показують усім той самий публічний каталог, приватна бібліотека містить рівно ті реакції, жарти й кліпи, які ти зібрав сам. На vids&gifs твоя бібліотека живе у папках, які ти контролюєш, і та сама бібліотека живить інлайн-пікер Telegram і автодоповнення /gif у Discord — тобі не доведеться тримати окремий набір під кожну платформу.",
      },
      {
        question: "Чим це відрізняється від збережених GIF у Telegram?",
        answer:
          "Список збережених GIF у Telegram існує тільки в межах Telegram, не має папок, не має пошуку поза іменем файлу й немає способу поділитися ним з другом. Твоя бібліотека vids&gifs — папкова (можеш тримати окремі набори під різні чати), пошукова за тегами й доступна з вебсайту, Telegram і Discord з тими самими даними. Перехід на новий телефон чи новий пристрій — усе на місці. А другу можеш дати read-only доступ до папки, щоб він користувався твоєю колекцією, не збираючи її сам.",
      },
      {
        question: "Як надсилати GIF інлайн у Telegram?",
        answer:
          "Підʼєднай свій Telegram-акаунт у Налаштуваннях → Підключення, потім у будь-якому чаті набери @vidsandgifsbot і пошуковий запит. Telegram покаже нативну інлайн-сітку з GIF твоєї активної папки — тапнеш на потрібний, і він одразу надішлеться. Перешлеш будь-який GIF боту — він додасться в ту саму папку, тож бібліотека росте з самого чату.",
      },
      {
        question: "Як надсилати GIF інлайн у Discord?",
        answer:
          "Додай бота vids&gifs на свій сервер (або користуйся в DM), підʼєднай акаунт у Налаштуваннях → Підключення й набери /gif. Слеш-автодоповнення Discord показує GIF з твоєї активної папки під час набору — обираєш потрібний, і бот публікує його в каналі. Команда /upload-file додає новий GIF просто з Discord; він потрапляє в активну папку й залишається пошуковим і на сайті.",
      },
      {
        question: "Що таке активна папка і чому це важливо?",
        answer:
          "Можеш тримати кілька папок (робочі GIF, гіфки для друзів, окремий жарт у групі тощо) й позначити одну з них «активною» в будь-який момент. Активна папка — це область пошуку для інлайн-пікера Telegram і автодоповнення /gif у Discord. Перемикаючись з робочого чату на дружній, ти один раз перемикаєш активну папку на сайті — обидва боти одразу починають показувати правильний набір реакцій.",
      },
      {
        question: "Чи можу я поділитися папкою з друзями?",
        answer:
          "Так. Відкрий будь-яку папку й натисни «Поділитися» — це згенерує read-only посилання. Хто має посилання, бачить твою папку live, поки ти її поповнюєш, без копій і ручної синхронізації. Їхня копія сама синхронізується. Чудово для групи друзів, яка хоче спільну реакційну бібліотеку, куратовану однією людиною.",
      },
      {
        question: "Чи моя бібліотека справді приватна?",
        answer:
          "Так. Папки приватні за замовчуванням — лише ти й акаунти, з якими ти явно поділився папкою, бачать вміст. Завантаження чогось у бібліотеку не публікує це. Єдиний спосіб, яким GIF стає публічним, — якщо ти вручну змінюєш видимість самого завантаження.",
      },
      {
        question: "Чи це безкоштовно?",
        answer:
          "Так. Створення папок, підʼєднання Telegram і Discord, інлайн-надсилання GIF, шеринг папок і завантаження нового медіа — усе працює на безкоштовному тарифі. Платний Pro-тариф існує для збільшених щоденних квот завантажень, але кожна функція крос-чатової бібліотеки доступна на безкоштовному плані без реклами.",
      },
      {
        question: "А якщо я просто хочу конвертувати GIF у MP4 (чи навпаки)?",
        answer:
          "Маємо безкоштовні окремі інструменти для цього — без реєстрації. Конвертер GIF → MP4 на vidsandgifs.com/uk/tools/gif-to-mp4, а MP4 → GIF — на vidsandgifs.com/uk/tools/mp4-to-gif. Обидва працюють повністю у твоєму браузері через ffmpeg.wasm; файл не покидає пристрій.",
      },
    ],
    moreBadge: "Ще",
    moreHeading: "Безкоштовні бічні інструменти",
    moreBody:
      "Треба конвертувати кліп перед завантаженням у бібліотеку? Маємо два безкоштовні окремі конвертери, що працюють повністю у браузері — без реєстрації, без завантаження.",
    ctaGifToMp4: "Конвертер GIF → MP4 →",
    ctaMp4ToGif: "Конвертер MP4 → GIF →",
    ctaFaq: "Повний FAQ",
    howToName:
      "Як налаштувати приватну бібліотеку GIF для Telegram і Discord",
    howToDescription:
      "Зареєструйся на vids&gifs, підʼєднай Telegram і Discord, завантаж свої GIF у папки й надсилай їх інлайн з будь-якого чату через @vidsandgifsbot або /gif.",
    howToSteps: [
      {
        name: "Створи безкоштовний акаунт",
        text: "Зареєструйся на vidsandgifs.com/uk/signup. Платіжна картка не потрібна — кожна функція крос-чатової бібліотеки доступна на безкоштовному плані.",
        url: "/uk/signup",
      },
      {
        name: "Завантаж GIF у папки",
        text: "Перетягни GIF і короткі відео в дашборд. Згрупуй їх у папки за темою — робота, друзі, окремий груповий чат — і обери одну як «активну».",
        url: "/uk/folders",
      },
      {
        name: "Підʼєднай Telegram",
        text: "У Налаштуваннях → Підключення зв'яжи @vidsandgifsbot зі своїм акаунтом. У будь-якому чаті Telegram набирай '@vidsandgifsbot пошук-термін' для інлайн-вибору GIF з активної папки.",
        url: "/uk/settings",
      },
      {
        name: "Підʼєднай Discord",
        text: "Додай бота vids&gifs на сервер (або у DM) і зв'яжи акаунт. Використовуй /gif для автодоповнення з активної папки або /upload-file для додавання нового медіа, не виходячи з Discord.",
        url: "/uk/settings",
      },
    ],
    appName: "vids&gifs — приватна бібліотека GIF для Telegram і Discord",
    appFeatures: [
      "Приватна бібліотека GIF і відео, організована в папки",
      "Інлайн-пікер GIF у Telegram через @vidsandgifsbot",
      "Інлайн-автодоповнення GIF у Discord через слеш-команду /gif",
      "Read-only шеринг папок із live-оновленнями",
      "Пошук за тегами в межах активної папки",
      "Перешли GIF боту — він додасться в активну папку",
    ],
    breadcrumb: {
      home: "vids&gifs",
      here: "Приватна бібліотека GIF",
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

export default async function PrivateGifLibraryPage() {
  const locale = await getServerLocale();
  const c = COPY[locale];
  const pageUrl = absoluteUrl(LOCALE_PATH[locale]);
  const otherLocale: Locale = locale === "uk" ? "en" : "uk";

  const homeUrl = locale === "uk" ? "/uk" : "/";
  const signupUrl = locale === "uk" ? "/uk/signup" : "/signup";
  const loginUrl = locale === "uk" ? "/uk/login" : "/login";
  const gifToMp4Url =
    locale === "uk" ? "/uk/tools/gif-to-mp4" : "/tools/gif-to-mp4";
  const mp4ToGifUrl =
    locale === "uk" ? "/uk/tools/mp4-to-gif" : "/tools/mp4-to-gif";
  const faqUrl = locale === "uk" ? "/uk/faq" : "/faq";

  const howToJsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    inLanguage: locale,
    name: c.howToName,
    description: c.howToDescription,
    totalTime: "PT5M",
    step: c.howToSteps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: absoluteUrl(step.url),
    })),
  };
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    inLanguage: locale,
    name: c.appName,
    url: pageUrl,
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Any (browser-based + Telegram bot + Discord bot)",
    browserRequirements:
      "Modern browser with JavaScript enabled; Telegram and/or Discord account for inline use",
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
        item: absoluteUrl(homeUrl),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: c.breadcrumb.here,
        item: pageUrl,
      },
    ],
  };

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
        <AnonChatLibraryHero />
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 1, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.oneLibHeading}
        </Heading>
        <Text as="p" color="gray" size="3" mb="5" style={{ maxWidth: 720 }}>
          {c.oneLibIntro}
        </Text>

        <Grid columns={{ initial: "1", sm: "3" }} gap="4">
          <BenefitCard
            Icon={ArchiveIcon}
            title={c.benefits[0].title}
            body={c.benefits[0].body}
          />
          <BenefitCard
            Icon={MagnifyingGlassIcon}
            title={c.benefits[1].title}
            body={c.benefits[1].body}
          />
          <BenefitCard
            Icon={Share1Icon}
            title={c.benefits[2].title}
            body={c.benefits[2].body}
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 2, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.howChatHeading}
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <ChatCard
            Icon={PaperPlaneIcon}
            title={c.chats[0].title}
            steps={c.chats[0].steps}
          />
          <ChatCard
            Icon={ChatBubbleIcon}
            title={c.chats[1].title}
            steps={c.chats[1].steps}
          />
        </Grid>
      </div>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 3, marginBottom: 32 }}
      >
        <Heading as="h2" size="7" mb="4" style={{ letterSpacing: "-0.02em" }}>
          {c.freeHeading}
        </Heading>
        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <UseCaseCard
            Icon={LockClosedIcon}
            title={c.free[0].title}
            body={c.free[0].body}
          />
          <UseCaseCard
            Icon={MixIcon}
            title={c.free[1].title}
            body={c.free[1].body}
          />
          <UseCaseCard
            Icon={MagnifyingGlassIcon}
            title={c.free[2].title}
            body={c.free[2].body}
          />
          <UseCaseCard
            Icon={Share1Icon}
            title={c.free[3].title}
            body={c.free[3].body}
          />
        </Grid>
      </div>

      <Flex
        direction="column"
        gap="3"
        align="center"
        className="intro-panel-fade-up"
        style={{
          ["--panel-index" as string]: 4,
          padding: "32px 24px",
          borderRadius: "var(--radius-4)",
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(70, 132, 255, 0.18) 0%, transparent 70%), " +
            "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
          border: "1px solid var(--gray-5)",
          marginBottom: 32,
        }}
      >
        <Heading
          as="h2"
          size="6"
          align="center"
          style={{ letterSpacing: "-0.02em" }}
        >
          {c.ctaHeading}
        </Heading>
        <Text as="p" color="gray" size="3" align="center" style={{ maxWidth: 560 }}>
          {c.ctaBody}
        </Text>
        <Flex gap="3" wrap="wrap" justify="center" mt="2">
          <Button asChild size="3" variant="solid" color="iris">
            <Link href={signupUrl}>{c.ctaSignup}</Link>
          </Button>
          <Button asChild size="3" variant="soft" color="gray">
            <Link href={loginUrl}>{c.ctaSignin}</Link>
          </Button>
        </Flex>
      </Flex>

      <div
        className="intro-panel-fade-up"
        style={{ ["--panel-index" as string]: 5, marginBottom: 32 }}
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
        style={{ ["--panel-index" as string]: 6, maxWidth: 760 }}
      >
        <Badge color="iris" variant="surface" radius="full">
          {c.moreBadge}
        </Badge>
        <Heading as="h2" size="6" style={{ letterSpacing: "-0.02em" }}>
          {c.moreHeading}
        </Heading>
        <Text as="p" color="gray" size="3" style={{ lineHeight: 1.6 }}>
          {c.moreBody}
        </Text>
        <Flex gap="3" wrap="wrap" mt="2">
          <Link
            href={gifToMp4Url}
            style={{
              color: "var(--accent-11)",
              textDecoration: "underline",
              fontSize: "var(--font-size-3)",
            }}
          >
            {c.ctaGifToMp4}
          </Link>
          <Link
            href={mp4ToGifUrl}
            style={{
              color: "var(--accent-11)",
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
  Icon: typeof ArchiveIcon;
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

function ChatCard({
  Icon,
  title,
  steps,
}: {
  Icon: typeof PaperPlaneIcon;
  title: string;
  steps: string[];
}) {
  return (
    <Box
      style={{
        padding: "24px",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-5)",
        background:
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
      }}
    >
      <Flex align="center" gap="3" mb="3">
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--accent-4)",
            color: "var(--accent-11)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon width="20" height="20" />
        </Box>
        <Heading as="h3" size="5" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </Heading>
      </Flex>
      <Box
        asChild
        style={{
          color: "var(--gray-11)",
          fontSize: "var(--font-size-2)",
          lineHeight: 1.7,
          paddingLeft: 18,
        }}
      >
        <ol>
          {steps.map((line, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {line}
            </li>
          ))}
        </ol>
      </Box>
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
