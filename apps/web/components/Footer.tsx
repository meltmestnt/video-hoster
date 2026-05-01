"use client";

import Link from "next/link";
import { Flex, Separator, Text } from "@radix-ui/themes";
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
      align="center"
      justify="center"
      gap="3"
      wrap="wrap"
      px="4"
      py="4"
      mt="6"
      style={{
        borderTop: "1px solid var(--gray-4)",
        color: "var(--gray-10)",
      }}
    >
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
  );
}
