"use client";

import Link from "next/link";
import { Flex, Separator, Text } from "@radix-ui/themes";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { useT } from "@/lib/i18n";

// Custom event name used to coordinate the "Cookie settings" button in the
// footer with the consent banner mounted in the root layout. When fired,
// the banner clears its persisted choice and re-renders.
export const CONSENT_RESET_EVENT = "vng:cookie-consent-reset";

const STORAGE_KEY = "cookie-consent";

export function Footer() {
  const t = useT();

  const reopenConsent = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CONSENT_RESET_EVENT));
  };

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
        <button
          onClick={reopenConsent}
          type="button"
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: "var(--font-size-1)",
            color: "inherit",
          }}
        >
          {t("footer.cookieSettings")}
        </button>
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
