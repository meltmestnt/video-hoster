"use client";

import Link from "next/link";
import { Flex, Separator, Text } from "@radix-ui/themes";
import { GitHubLogoIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { useT } from "@/lib/i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { telegramBotUrl } from "@/lib/telegram-bot";

export function Footer() {
  const t = useT();

  return (
    <Flex
      direction="column"
      align="center"
      gap="2"
      px="4"
      py="4"
      mt="6"
      style={{
        borderTop: "1px solid var(--gray-4)",
        color: "var(--gray-10)",
      }}
    >
      <Flex align="center" justify="center" gap="3" wrap="wrap">
        <Text size="1">© vids&amp;gifs</Text>
        <Separator orientation="vertical" />
        <Link
          href="/privacy"
          style={{ color: "inherit", fontSize: "var(--font-size-1)" }}
        >
          {t("footer.privacy")}
        </Link>
        <Separator orientation="vertical" />
        <Link
          href="/faq"
          style={{ color: "inherit", fontSize: "var(--font-size-1)" }}
        >
          {t("footer.faq")}
        </Link>
        <Separator orientation="vertical" />
        <Link
          href="/tools/gif-to-mp4"
          style={{ color: "inherit", fontSize: "var(--font-size-1)" }}
        >
          GIF → MP4
        </Link>
        <Separator orientation="vertical" />
        {/* Discoverability anchor for the bot — Telegram's name search
            is popularity-gated, so a stable footer link gives every
            visitor a one-tap path to @vidsandgifsbot. */}
        <a
          href={telegramBotUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "inherit",
            fontSize: "var(--font-size-1)",
          }}
        >
          <PaperPlaneIcon width="13" height="13" />
          {t("telegram.openBot.footer")}
        </a>
        <Separator orientation="vertical" />
        {/* Surface the locale toggle on every page (it was previously
            only on the signed-out intro hero) so visitors who land on
            /videos, /login, etc. can switch language. */}
        <LocaleSwitcher size="1" />
      </Flex>
      <Flex align="center" justify="center" gap="2" wrap="wrap">
        <Text size="1">{t("footer.createdBy")}</Text>
        <a
          href="https://github.com/meltmestnt"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "var(--gray-12)",
            fontSize: "var(--font-size-1)",
          }}
        >
          <GitHubLogoIcon width="13" height="13" />
          meltmestnt
        </a>
        <Text size="1" color="gray">
          ·
        </Text>
        <Text size="1">
          {t("footer.withHelpFrom")} Claude{" "}
          <span aria-label="heart">❤️</span>
        </Text>
      </Flex>
    </Flex>
  );
}
