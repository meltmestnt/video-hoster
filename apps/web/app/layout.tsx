import "@radix-ui/themes/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Theme } from "@radix-ui/themes";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Denis's videos",
  description: "A minimalist video hosting platform",
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
