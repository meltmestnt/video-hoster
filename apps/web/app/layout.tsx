import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Theme } from "@radix-ui/themes";
import { Providers } from "./providers";
import { siteUrl } from "@/lib/site";

const SITE_NAME = "vids&gifs";
const SITE_DESCRIPTION =
  "Upload, share, and discover short videos, GIFs, and screenshots.";

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
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl(),
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
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
        <Theme appearance="dark" accentColor="iris" radius="large" scaling="100%">
          <Providers>{children}</Providers>
        </Theme>
      </body>
    </html>
  );
}
