"use client";

import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross1Icon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

// Per-user key so a different account signing in on the same browser
// gets a fresh prompt — the previous tenant's dismissal shouldn't
// follow them.
function dismissedKey(userId: string): string {
  return `telegramPromoDismissed:${userId}`;
}

function readDismissed(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(dismissedKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(dismissedKey(userId), "1");
  } catch {
    /* private mode — fine */
  }
}

/**
 * Inline dashboard banner that pitches the Telegram bot integration to
 * users who haven't linked it yet. Auto-hides once `auth.me` reports a
 * link, when the bot isn't configured server-side, or after a manual
 * dismiss (persisted in localStorage so it doesn't keep nagging the user
 * who said no once).
 */
export function TelegramPromoBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const startLink = trpc.telegram.startLink.useMutation();
  // Tracks whether THIS user dismissed the banner. Defaults to true so
  // nothing flashes in during SSR / hydration; the effect below flips
  // it to the persisted value once we know which user we're rendering for.
  const [dismissed, setDismissed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userId = me.data?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    setDismissed(readDismissed(userId));
  }, [userId]);

  if (dismissed) return null;
  // Wait until auth.me has resolved before deciding — otherwise the
  // banner flashes in for the loading window even when the user has
  // already linked Telegram. Also covers the anon case (me.data === null).
  if (!me.data) return null;
  if (me.data.telegramLinked) return null;
  // Bot not configured on this server — no point pitching it.
  if (startLink.error?.data?.code === "PRECONDITION_FAILED") return null;

  const onConnect = async () => {
    setError(null);
    try {
      const { url } = await startLink.mutateAsync();
      window.open(url, "_blank", "noopener,noreferrer");
      void utils.telegram.status.invalidate();
      void utils.auth.me.invalidate();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onDismiss = () => {
    if (userId) writeDismissed(userId);
    setDismissed(true);
  };

  return (
    <Box
      className="intro-card intro-card-blue"
      style={{
        position: "relative",
        borderRadius: "var(--radius-4)",
        background:
          "radial-gradient(circle at 100% 0%, rgba(70, 132, 255, 0.18) 0%, transparent 55%), " +
          "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
        border: "1px solid var(--gray-5)",
        padding: "16px 20px",
        marginBottom: 20,
      }}
    >
      <Flex align="center" gap="4" wrap="wrap">
        <Flex
          align="center"
          justify="center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: "var(--blue-3)",
            color: "var(--blue-11)",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <PaperPlaneIcon width="20" height="20" />
        </Flex>
        <Box style={{ flex: 1, minWidth: 220 }}>
          <Text as="div" size="3" weight="medium">
            {t("dashboard.telegramPromo.title")}
          </Text>
          <Text as="div" size="2" color="gray">
            {t("dashboard.telegramPromo.body")}
          </Text>
          {error && (
            <Text as="div" size="1" color="red" mt="1">
              {error}
            </Text>
          )}
        </Box>
        <Flex gap="2" align="center" style={{ flexShrink: 0 }}>
          <Button
            size="2"
            color="blue"
            onClick={onConnect}
            disabled={startLink.isPending}
          >
            {startLink.isPending
              ? t("dashboard.telegramPromo.connecting")
              : t("dashboard.telegramPromo.connect")}
          </Button>
          <IconButton
            size="2"
            variant="ghost"
            color="gray"
            onClick={onDismiss}
            aria-label={t("dashboard.telegramPromo.dismiss")}
          >
            <Cross1Icon />
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
}
