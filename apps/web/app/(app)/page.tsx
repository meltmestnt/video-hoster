import type { Metadata } from "next";
import { AnonymousIntro } from "@/components/AnonymousIntro";
import { absoluteUrl } from "@/lib/site";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

// The root path is the natural landing for any "vids and gifs" /
// "vidsandgifs" search, so we use `title.absolute` here to break out of
// the layout's "%s — vids&gifs" template and lead with the brand. Both
// strings stay inside Google's SERP-rendered limits — title under ~65
// chars, description under ~155 — so the snippet doesn't get truncated
// mid-phrase. The page itself carries the long-form pitch.
const HOME_COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string; ogDescription: string }
> = {
  en: {
    title: "vids & gifs — private GIFs and videos in every chat",
    description:
      "vids & gifs: your private library of GIFs and videos, sendable inline from any Telegram or Discord chat. Free in-browser GIF ↔ MP4 converter.",
    ogTitle:
      "vids & gifs — private GIFs and videos, every chat (Telegram + Discord)",
    ogDescription:
      "One private library of GIFs and videos, sendable inline from Telegram and Discord — plus a free in-browser GIF ↔ MP4 converter. vidsandgifs.com.",
  },
  uk: {
    title: "vids & gifs — приватні GIF і відео у кожному чаті",
    description:
      "vids & gifs: твоя приватна бібліотека GIF і відео, інлайн з будь-якого чату Telegram або Discord. Безкоштовний конвертер GIF ↔ MP4 у браузері.",
    ogTitle:
      "vids & gifs — приватні GIF і відео, кожен чат (Telegram + Discord)",
    ogDescription:
      "Одна приватна бібліотека GIF і відео — інлайн з Telegram і Discord. Плюс безкоштовний конвертер GIF ↔ MP4 у браузері. vidsandgifs.com.",
  },
};

const HOME_LOCALE_URL: Record<Locale, string> = {
  en: absoluteUrl("/"),
  uk: absoluteUrl("/uk"),
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const copy = HOME_COPY[locale];
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: HOME_LOCALE_URL[locale],
      languages: {
        en: HOME_LOCALE_URL.en,
        uk: HOME_LOCALE_URL.uk,
        "x-default": HOME_LOCALE_URL.en,
      },
    },
    openGraph: {
      title: copy.ogTitle,
      description: copy.ogDescription,
      url: HOME_LOCALE_URL[locale],
      type: "website",
      locale: locale === "uk" ? "uk_UA" : "en_US",
      alternateLocale: locale === "uk" ? ["en_US"] : ["uk_UA"],
    },
  };
}

// `/` is now the marketing landing for every visitor, signed-in or not.
// The signed-in feed (with promo banners, drop tile, and the merged
// videos+gifs grid) moved to `/all`, which is the entry the topbar
// already points at — so signed-in users still have a one-click path to
// their library without `/` cluttering the brand landing.
export default function DashboardPage() {
  return <AnonymousIntro />;
}
