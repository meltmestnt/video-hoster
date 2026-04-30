import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Theme } from "@radix-ui/themes";
import { Providers } from "./providers";
import { siteUrl } from "@/lib/site";

const SITE_NAME = "Video Hoster";
const SITE_DESCRIPTION =
  "A minimalist video hosting platform — watch and share short videos.";

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
    <html lang="en">
      <body>
        <Theme appearance="dark" accentColor="iris" radius="large" scaling="100%">
          <Providers>{children}</Providers>
        </Theme>
      </body>
    </html>
  );
}
