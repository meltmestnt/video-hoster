"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";
import { CONSENT_RESET_EVENT } from "./Footer";

const STORAGE_KEY = "cookie-consent";
type Consent = "accepted" | "declined";

// Renders a bottom-of-page consent banner on first visit and remembers the
// choice in localStorage so it doesn't reappear on subsequent loads. While
// the choice is pending or the user declined, no analytics scripts are
// rendered — that's what makes this GDPR-meaningful (declining must
// actually prevent loading, not just hide a banner).
export function CookieConsent({ gaId }: { gaId: string }) {
  const t = useT();
  const [consent, setConsent] = useState<Consent | null>(null);
  // Avoids an SSR/CSR mismatch: the server can't read localStorage, so we
  // render nothing on the first paint and let the banner appear after
  // mount once we've checked persisted state.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "accepted" || stored === "declined") {
      setConsent(stored);
    }
    setHydrated(true);

    // The footer's "Cookie settings" link clears the stored choice and
    // fires this event so the banner reappears without a page reload.
    const onReset = () => setConsent(null);
    window.addEventListener(CONSENT_RESET_EVENT, onReset);
    return () => window.removeEventListener(CONSENT_RESET_EVENT, onReset);
  }, []);

  // While the banner is showing, mark <body> so globals.css can add
  // padding-bottom equal to the banner's max height. Otherwise on mobile
  // the position:fixed banner sits on top of page CTAs.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (hydrated && consent === null) {
      document.body.classList.add("has-cookie-banner");
      return () => document.body.classList.remove("has-cookie-banner");
    }
  }, [hydrated, consent]);

  const choose = (next: Consent) => {
    localStorage.setItem(STORAGE_KEY, next);
    setConsent(next);
  };

  return (
    <>
      {consent === "accepted" && <GoogleAnalytics gaId={gaId} />}
      {hydrated && consent === null && (
        <Box
          role="region"
          aria-label="Cookie consent"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            // Hardcoded dark grays instead of var(--gray-*) so the banner
            // looks correct even on first paint (before Theme CSS is
            // applied) and on any future page that escapes the dark Theme
            // scope. Matches the page chrome's neutral dark palette.
            background: "#1a1a1a",
            color: "#e4e4e7",
            borderTop: "1px solid #2a2a2a",
            boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.4)",
            padding: "14px 16px",
          }}
        >
          <Flex
            align="center"
            justify="between"
            gap="3"
            wrap="wrap"
            style={{ maxWidth: 1200, margin: "0 auto" }}
          >
            <Text
              size="2"
              style={{ flex: 1, minWidth: 280, color: "#e4e4e7" }}
            >
              {t("consent.message")}{" "}
              <Link
                href="/privacy"
                style={{
                  color: "var(--accent-9)",
                  textDecoration: "underline",
                }}
              >
                {t("consent.learnMore")}
              </Link>
            </Text>
            <Flex gap="2">
              <Button
                variant="soft"
                color="gray"
                onClick={() => choose("declined")}
                size="2"
              >
                {t("consent.decline")}
              </Button>
              <Button
                variant="solid"
                onClick={() => choose("accepted")}
                size="2"
              >
                {t("consent.accept")}
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}
    </>
  );
}
