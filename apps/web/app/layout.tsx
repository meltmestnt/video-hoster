import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Theme } from "@radix-ui/themes";
import { CookieConsent } from "@/components/CookieConsent";
import { RegisterSW } from "@/components/RegisterSW";
import { Providers } from "./providers";
import { siteUrl } from "@/lib/site";
import { getServerLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/locale";

// GA4 Measurement ID. Pinned to the vidsandgifs.xyz property so a fresh
// deploy starts tracking without any Railway config — same approach as the
// Google site-verification token below. Override via NEXT_PUBLIC_GA_ID if
// you ever rotate properties or need a different one per environment;
// explicitly setting it to an empty string disables analytics.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-ST8WSD8TJE";

const SITE_NAME = "vids&gifs";

// Per-locale title + description. The English copy is the canonical
// branding text — Latin-script keywords like "vidsandgifs" rank the same
// in any locale, so we keep the English title even in Ukrainian SERPs and
// only swap the prose description. That keeps the SERP snippet in the
// language Google's user is searching in (its "result language" is mostly
// driven by Accept-Language at crawl time).
const COPY: Record<
  Locale,
  { title: string; description: string; ogTitle: string }
> = {
  en: {
    title: "vids & gifs — upload videos and GIFs, convert, share",
    ogTitle: "vids & gifs — upload videos and GIFs, convert, share",
    description:
      "vids & gifs (vidsandgifs.xyz) — upload, share, convert, and download short videos, GIFs, and screenshots in your browser. Trim and compress videos, convert MP4 to GIF, capture frames as screenshots, and post them to your feed. Free, no installs, works on desktop and mobile.",
  },
  uk: {
    title: "vids & gifs — завантажуй відео і GIF, конвертуй та ділись",
    ogTitle: "vids & gifs — завантажуй відео і GIF, конвертуй та ділись",
    description:
      "vids & gifs (vidsandgifs.xyz) — завантажуй, ділись, конвертуй і качай короткі відео, GIF та скріншоти у браузері. Обрізай і стискай відео, перетворюй MP4 у GIF, зберігай кадри як скріншоти й публікуй у стрічці. Безкоштовно, без встановлення, працює на ПК і смартфоні.",
  },
};

const SITE_KEYWORDS = [
  "vids and gifs",
  "vids & gifs",
  "vidsandgifs",
  "vidsandgifs.xyz",
  "vids gifs",
  "upload vids and gifs",
  "upload video",
  "upload gif",
  "share videos",
  "share gifs",
  "video to gif",
  "mp4 to gif",
  "gif to video",
  "compress video online",
  "screenshot from video",
  "online video editor",
  "in-browser video editor",
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
      canonical: "/",
      languages: {
        en: "/",
        uk: "/",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: copy.ogTitle,
      description: copy.description,
      url: siteUrl(),
      locale: locale === "uk" ? "uk_UA" : "en_US",
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
      "vidsandgifs.xyz",
      "vids gifs",
    ],
    url: siteUrl(),
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
            __html: JSON.stringify(websiteJsonLd(description)),
          }}
        />
        <Theme appearance="dark" accentColor="iris" radius="large" scaling="100%">
          <Providers initialLocale={locale}>{children}</Providers>
          {/* Mounted inside <Theme> so the banner's Radix Buttons + CSS
              tokens (--gray-*, --accent-*) resolve against the dark
              palette instead of the unstyled default. */}
          {GA_ID && <CookieConsent gaId={GA_ID} />}
          <RegisterSW />
        </Theme>
      </body>
    </html>
  );
}
