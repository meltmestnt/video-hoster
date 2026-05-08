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

// Per-locale title + description. Both are sized for SERP rendering:
// title around 60 chars (Google trims at ~580px), description around
// 150 chars (Google trims at ~155–160). The home page (app/(app)/page.tsx)
// overrides these with longer copy keyed at the brand, since the bare
// root is the most-likely landing for "vidsandgifs" branded queries.
const COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string }
> = {
  en: {
    title: "vids & gifs — private GIFs and videos in every chat",
    ogTitle:
      "vids & gifs — private GIFs and videos in every chat (Telegram + Discord)",
    description:
      "Your private library of GIFs and videos, sendable inline from any Telegram or Discord chat. Free in-browser GIF ↔ MP4 converter included.",
  },
  uk: {
    title: "vids & gifs — приватні GIF і відео у кожному чаті",
    ogTitle:
      "vids & gifs — приватні GIF і відео у кожному чаті (Telegram + Discord)",
    description:
      "Твоя приватна бібліотека GIF і відео — інлайн з будь-якого чату Telegram чи Discord. Безкоштовний конвертер GIF ↔ MP4 у браузері включено.",
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
  "gifs and videos",
  "all gifs",
  "all videos",
  "all gifs and videos",
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
  "telegram gif",
  "telegram gifs",
  "telegram video",
  "telegram videos",
  "telegram gif bot",
  "telegram gif inline picker",
  "telegram gif search",
  "send gifs in telegram",
  "inline gif search telegram",
  "vidsandgifsbot",
  "@vidsandgifsbot",
  // Discord — English
  "discord gif",
  "discord gifs",
  "discord video",
  "discord videos",
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
  "video to gif converter",
  "video to gif convertor",
  "gif to video converter",
  "gif to video convertor",
  "mp4 to gif convertor",
  "gif to mp4 convertor",
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
  "телеграм гіф",
  "телеграм гіфки",
  "телеграм відео",
  "discord бот для gif",
  "discord слеш команда gif",
  "discord гіф",
  "discord гіфки",
  "discord відео",
  "приватні gif",
  "приватні гіфки",
  "відео і gif",
  "відео і гіф",
  "відео і гіфки",
  "гіф і відео",
  "гіфки і відео",
  "усі гіфки",
  "усі відео",
  "всі гіфки",
  "всі відео",
  "конвертер gif у mp4",
  "конвертер mp4 у gif",
  "конвертер відео у gif",
  "конвертер gif у відео",
  "конвертувати gif у mp4",
  "конвертувати mp4 у gif",
  "конвертувати відео у gif",
  "конвертнути гіф",
  "конвертнути gif у відео",
  "обрізати відео онлайн",
  "стиснути відео онлайн",
  // Russian (broad reach — Yandex picks these up directly)
  "приватная библиотека gif",
  "приватные папки гифок",
  "gif библиотека для telegram и discord",
  "телеграм бот для гифок",
  "телеграм гиф",
  "телеграм гифки",
  "телеграм видео",
  "discord бот для гифок",
  "discord слеш команда gif",
  "discord гиф",
  "discord гифки",
  "discord видео",
  "приватные гифки",
  "гифки и видео",
  "видео и гифки",
  "видео и гиф",
  "гиф и видео",
  "все гифки",
  "все видео",
  "конвертер gif в mp4",
  "конвертер mp4 в gif",
  "конвертер видео в gif",
  "конвертер gif в видео",
  "конвертировать видео в gif",
  "конвертировать gif в видео",
  "видео в gif",
  "gif в видео",
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
// canonical don't change; Ukrainian lives under the `/uk` path prefix,
// which middleware.ts rewrites to the underlying route while persisting
// the locale via the `x-locale-override` header and `vh.locale` cookie.
// Path-based locale URLs are Google's recommendation over query params —
// they're treated as fully distinct documents instead of variants of one
// canonical. The legacy `?lang=uk` query param still works for any
// in-flight bookmarks.
const LOCALE_PATH: Record<Locale, string> = {
  en: "/",
  uk: "/uk",
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

// Schema.org payload Google reads to learn the canonical brand plus
// what kind of thing this domain is. Combining `WebSite` and
// `WebApplication` in a single `@graph` lets the same script tag declare
// both: WebSite gives Google the SearchAction sitelink and the brand
// alternates so any common spelling resolves to this domain, while
// WebApplication tags the home as a free, browser-based multimedia tool
// — search engines (Google, Bing) sometimes surface app-style result
// cards for that schema type.
function websiteJsonLd(description: string) {
  const url = siteUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: SITE_NAME,
        alternateName: [
          "vids & gifs",
          "vids and gifs",
          "vidsandgifs",
          "vidsandgifs.com",
          "vidsandgifs.xyz",
          "vids gifs",
          "videos and gifs",
          "gifs and videos",
          // Cyrillic alternates so Yandex/Google associate Russian and
          // Ukrainian queries with the same canonical brand.
          "відео і GIF",
          "відео і гіф",
          "відео і гіфки",
          "гіф і відео",
          "гіфки і відео",
          "видео и гифки",
          "видео и гиф",
          "гиф и видео",
          "гифки и видео",
        ],
        url,
        inLanguage: ["en", "uk"],
        description,
        potentialAction: {
          "@type": "SearchAction",
          target: `${url}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: SITE_NAME,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        browserRequirements:
          "Requires modern browser with JavaScript and WebAssembly enabled",
        url,
        description,
        // Free in every meaningful sense — no advertising, no paid wall.
        // Pro tier exists for higher quotas only.
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
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
