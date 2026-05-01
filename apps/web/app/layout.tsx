import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Theme } from "@radix-ui/themes";
import { CookieConsent } from "@/components/CookieConsent";
import { Providers } from "./providers";
import { siteUrl } from "@/lib/site";

// GA4 Measurement ID. Pinned to the vidsandgifs.xyz property so a fresh
// deploy starts tracking without any Railway config — same approach as the
// Google site-verification token below. Override via NEXT_PUBLIC_GA_ID if
// you ever rotate properties or need a different one per environment;
// explicitly setting it to an empty string disables analytics.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-ST8WSD8TJE";

const SITE_NAME = "vids&gifs";
// Plain-text variants of the brand. Search engines tokenize them as
// separate words, so seeding all three forms — "vids&gifs",
// "vids and gifs", "vidsandgifs" — gives us a hit on whichever spelling
// the user types into Google.
const SITE_DESCRIPTION =
  "vids & gifs (vidsandgifs.xyz) — upload, share, convert, and download short videos, GIFs, and screenshots in your browser. Trim and compress videos, convert MP4 to GIF, capture frames as screenshots, and post them to your feed. Free, no installs, works on desktop and mobile.";
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
// vidsandgifs.xyz property here means a fresh deploy is verified without
// any Railway config. Override via env if you ever rotate the property or
// need a different token per environment.
const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION ??
  "nKXIsKwl0ygpSh3BMcTlHKGuvxHeETkh9T-wqlMhcQY";
const BING_SITE_VERIFICATION = process.env.BING_SITE_VERIFICATION;
const YANDEX_SITE_VERIFICATION = process.env.YANDEX_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    // Branded long-form title used as the default for any page that
    // doesn't override `title`. Google trims past ~60 chars, so the
    // most-searched phrases ("vids and gifs", "upload videos") are kept
    // up front.
    default: "vids & gifs — upload videos and GIFs, convert, share",
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "vids & gifs — upload videos and GIFs, convert, share",
    description: SITE_DESCRIPTION,
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: "vids & gifs — upload videos and GIFs, convert, share",
    description: SITE_DESCRIPTION,
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
const WEBSITE_JSONLD = {
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
  description: SITE_DESCRIPTION,
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteUrl()}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning silences React's mismatch warning when
          browser extensions (ColorZilla, Grammarly, etc.) add their own
          attributes to <html>/<body> before React hydrates. Only applies
          to the root tags — content inside is still strictly checked. */}
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSONLD) }}
        />
        <Theme appearance="dark" accentColor="iris" radius="large" scaling="100%">
          <Providers>{children}</Providers>
          {/* Mounted inside <Theme> so the banner's Radix Buttons + CSS
              tokens (--gray-*, --accent-*) resolve against the dark
              palette instead of the unstyled default. */}
          {GA_ID && <CookieConsent gaId={GA_ID} />}
        </Theme>
      </body>
    </html>
  );
}
