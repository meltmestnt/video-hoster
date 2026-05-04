import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Theme } from "@radix-ui/themes";
import { PlausibleScript } from "@/components/PlausibleScript";
import { RegisterSW } from "@/components/RegisterSW";
import { Providers } from "./providers";
import { siteUrl } from "@/lib/site";
import { jsonLdScript } from "@/lib/seo";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

// Plausible Analytics — cookieless aggregate analytics. Empty / unset
// disables tracking, which is what dev environments want. We dropped
// the GA + cookie-consent setup that used to live here: Plausible
// doesn't store cookies, doesn't track personal data, doesn't need a
// GDPR/ePrivacy consent gate at all. Same numbers we cared about
// (pageviews, bounce, time on page, country/device, outbound clicks,
// custom events), 1 KB instead of 50, no banner.
//
// The full tracker URL (e.g. https://plausible.io/js/pa-XXX.js) is
// what Plausible's dashboard hands you — the site identifier lives
// inside the URL itself rather than as a separate `data-domain`
// attribute (legacy v1 pattern, no longer issued).
const PLAUSIBLE_SCRIPT_URL = process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL ?? "";

const SITE_NAME = "vids&gifs";

// Per-locale title + description. The English copy is the canonical
// branding text — Latin-script keywords like "vidsandgifs" rank the same
// in any locale, so we keep the English title even in Ukrainian SERPs and
// only swap the prose description. That keeps the SERP snippet in the
// language Google's user is searching in (its "result language" is mostly
// driven by Accept-Language at crawl time, supplemented by the
// `?lang=<locale>` URL middleware writes a cookie for).
const COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string }
> = {
  en: {
    title:
      "vids & gifs — your private GIFs and videos in every chat (Telegram + Discord), GIF ↔ MP4 converter",
    ogTitle:
      "vids & gifs — private GIFs and videos in every chat (Telegram + Discord)",
    description:
      "vids & gifs (vidsandgifs.com) — your private library of GIFs and videos, sendable inline from any chat. Curate folders only you can see and reach them through @vidsandgifsbot's inline picker on Telegram and the /gif slash command on Discord — same library, every surface. Also a free in-browser GIF ↔ MP4 converter, video trimming, audio overlay, and frame-by-frame screenshots. No installs, works on desktop and mobile.",
  },
  uk: {
    title:
      "vids & gifs — твої приватні GIF і відео у кожному чаті (Telegram + Discord), конвертер GIF ↔ MP4",
    ogTitle:
      "vids & gifs — приватні GIF і відео у кожному чаті (Telegram + Discord)",
    description:
      "vids & gifs (vidsandgifs.com) — твоя приватна бібліотека GIF і відео, яку можна слати інлайн з будь-якого чату. Складай у папки, які бачиш лише ти, і діставай через інлайн-пікер @vidsandgifsbot у Telegram та слеш-команду /gif у Discord — одна бібліотека, кожна поверхня. А ще безкоштовний конвертер GIF ↔ MP4 у браузері, обрізання відео, аудіо-накладки та скріншоти з будь-якого кадру. Без встановлення, працює на ПК і смартфоні.",
  },
};

// Search engines (especially Yandex/Bing — Google ignores `<meta keywords>`
// since 2009) read this list when ranking morphologically related queries.
// We mix English brand spellings, English long-tails, and Cyrillic
// transliterations of the same intents so a Russian or Ukrainian searcher
// typing "конвертер gif в mp4" or "гифки и видео" matches us as readily
// as an English one typing "convert gif to mp4".
const SITE_KEYWORDS = [
  // Brand spellings
  "vids and gifs",
  "vids & gifs",
  "vidsandgifs",
  "vidsandgifs.com",
  "vidsandgifs.xyz",
  "vids gifs",
  "videos and gifs",
  // Cross-chat private library — the differentiator, lead the keyword
  // list with these so morphological matches for the killer-feature
  // queries rank above the commodity converter terms.
  "private gif library",
  "private gif folders",
  "private video library",
  "shared gif library",
  "shared library across chats",
  "send gifs from telegram and discord",
  "one gif library every chat",
  "gif library across telegram and discord",
  // Telegram — English
  "telegram gif bot",
  "telegram gif inline picker",
  "telegram gif search",
  "send gifs in telegram",
  "inline gif search telegram",
  "vidsandgifsbot",
  "@vidsandgifsbot",
  // Discord — English
  "discord gif bot",
  "discord gif slash command",
  "discord /gif command",
  "discord gif autocomplete",
  "send gifs in discord",
  "private gif library discord",
  // Folders + sharing
  "private gifs",
  "share gif folder",
  "read-only gif folder",
  // Core actions — English
  "upload videos and gifs",
  "upload video",
  "upload gif",
  "share videos",
  "share gifs",
  // GIF ↔ MP4 conversion — secondary feature, kept for long-tail SEO
  "convert gif to mp4",
  "convert mp4 to gif",
  "gif to mp4",
  "mp4 to gif",
  "gif to video",
  "video to gif",
  "online gif converter",
  "in-browser gif converter",
  "gif to mp4 converter",
  "mp4 to gif converter",
  // Editor + screenshot
  "compress video online",
  "trim video online",
  "screenshot from video",
  "extract frame from video",
  "online video editor",
  "in-browser video editor",
  // Ukrainian — lead with cross-chat library terms here too
  "приватна бібліотека gif",
  "приватні папки gif",
  "gif бібліотека для telegram і discord",
  "телеграм бот для gif",
  "телеграм гіф бот",
  "discord бот для gif",
  "discord слеш команда gif",
  "приватні gif",
  "приватні гіфки",
  "відео і gif",
  "гіфки і відео",
  "конвертер gif у mp4",
  "конвертер mp4 у gif",
  "конвертувати gif у mp4",
  "конвертувати mp4 у gif",
  "конвертнути гіф",
  "конвертнути gif у відео",
  "обрізати відео онлайн",
  "стиснути відео онлайн",
  // Russian (broad reach — Yandex picks these up directly)
  "приватная библиотека gif",
  "приватные папки гифок",
  "gif библиотека для telegram и discord",
  "телеграм бот для гифок",
  "discord бот для гифок",
  "discord слеш команда gif",
  "приватные гифки",
  "гифки и видео",
  "видео и гифки",
  "конвертер gif в mp4",
  "конвертер mp4 в gif",
  "gif в mp4 онлайн",
  "mp4 в gif онлайн",
];

// Search engine site-verification tokens. These are public values that get
// emitted into every page's <meta>, so pinning the Google token to the
// vidsandgifs.com property here means a fresh deploy is verified without
// any Railway config. Override via env if you ever rotate the property or
// need a different token per environment.
const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION ??
  "exYyOg4bejyDiY-EN71yMcqrQROhJ0rd4IgBTplDsiE";
const BING_SITE_VERIFICATION = process.env.BING_SITE_VERIFICATION;
const YANDEX_SITE_VERIFICATION = process.env.YANDEX_SITE_VERIFICATION;

// Per-locale URLs let Google index each language separately. English
// stays at the bare root so existing inbound links and the brand
// canonical don't change; Ukrainian gets `?lang=uk`, which middleware.ts
// honors via the `x-locale-override` header. The canonical we emit on
// each rendered request points at the URL whose content this page
// actually serves — otherwise Google merges the two and one locale
// drops out of the index.
const LOCALE_PATH: Record<Locale, string> = {
  en: "/",
  uk: "/?lang=uk",
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const copy = COPY[locale];
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      // Branded long-form title used as the default for any page that
      // doesn't override `title`. Google trims past ~60 chars, so the
      // most-searched phrases ("vids and gifs", "upload videos") are kept
      // up front.
      default: copy.title,
      template: `%s — ${SITE_NAME}`,
    },
    description: copy.description,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    alternates: {
      canonical: LOCALE_PATH[locale],
      languages: {
        en: LOCALE_PATH.en,
        uk: LOCALE_PATH.uk,
        "x-default": LOCALE_PATH.en,
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: copy.ogTitle,
      description: copy.description,
      url: new URL(LOCALE_PATH[locale], siteUrl()).toString(),
      locale: locale === "uk" ? "uk_UA" : "en_US",
      alternateLocale: locale === "uk" ? ["en_US"] : ["uk_UA"],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.ogTitle,
      description: copy.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    verification: {
      ...(GOOGLE_SITE_VERIFICATION
        ? { google: GOOGLE_SITE_VERIFICATION }
        : {}),
      ...(YANDEX_SITE_VERIFICATION
        ? { yandex: YANDEX_SITE_VERIFICATION }
        : {}),
      ...(BING_SITE_VERIFICATION
        ? { other: { "msvalidate.01": BING_SITE_VERIFICATION } }
        : {}),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

// Schema.org WebSite payload Google reads to learn the canonical brand
// plus alternates. Listing every spelling we want to rank for as
// `alternateName` tells search engines that "vids and gifs",
// "vidsandgifs", and "vids & gifs" are the same site, so a query in any
// of those forms can surface this domain.
function websiteJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: [
      "vids & gifs",
      "vids and gifs",
      "vidsandgifs",
      "vidsandgifs.com",
      "vidsandgifs.xyz",
      "vids gifs",
      "videos and gifs",
      // Cyrillic alternates so Yandex/Google associate Russian and
      // Ukrainian queries with the same canonical brand.
      "відео і GIF",
      "гіфки і відео",
      "видео и гифки",
    ],
    url: siteUrl(),
    inLanguage: ["en", "uk"],
    description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl()}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getServerLocale();
  const description = COPY[locale].description;
  return (
    <html lang={locale} suppressHydrationWarning>
      {/* suppressHydrationWarning silences React's mismatch warning when
          browser extensions (ColorZilla, Grammarly, etc.) add their own
          attributes to <html>/<body> before React hydrates. Only applies
          to the root tags — content inside is still strictly checked. */}
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(websiteJsonLd(description)),
          }}
        />
        <Theme appearance="dark" accentColor="iris" radius="large" scaling="100%">
          <Providers initialLocale={locale}>{children}</Providers>
          {PLAUSIBLE_SCRIPT_URL && (
            <PlausibleScript scriptUrl={PLAUSIBLE_SCRIPT_URL} />
          )}
          <RegisterSW />
        </Theme>
      </body>
    </html>
  );
}
