"use client";

import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { ChatBubbleIcon, Cross1Icon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

// Per-user key so a different account on the same browser sees a fresh
// prompt — the previous tenant's dismissal shouldn't follow them.
function dismissedKey(userId: string): string {
  return `discordPromoDismissed:${userId}`;
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
 * Mirrors TelegramPromoBanner. The Discord link flow is multi-step
 * (install bot, paste code), so the CTA points at /settings rather
 * than trying to inline-mint a code here. Auto-hides once auth.me
 * reports a discord link, when the bot isn't configured server-side
 * (startLink errors PRECONDITION_FAILED), or after a manual dismiss.
 */
export function DiscordPromoBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const startLink = trpc.discord.startLink.useMutation();
  const [mounted, setMounted] = useState(false);
  const [dismissTick, setDismissTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!me.data) return null;
  if (me.data.discordLinked) return null;
  if (startLink.error?.data?.code === "PRECONDITION_FAILED") return null;

  const userId = me.data.id;
  void dismissTick;
  if (readDismissed(userId)) return null;

  const onDismiss = () => {
    writeDismissed(userId);
    setDismissTick((n) => n + 1);
  };

  return (
    <Box
      className="intro-card intro-card-iris"
      style={{
        position: "relative",
        borderRadius: "var(--radius-4)",
        background:
          "radial-gradient(circle at 100% 0%, rgba(118, 121, 252, 0.18) 0%, transparent 55%), " +
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
            background: "var(--iris-3)",
            color: "var(--iris-11)",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <ChatBubbleIcon width="20" height="20" />
        </Flex>
        <Box style={{ flex: 1, minWidth: 220 }}>
          <Text as="div" size="3" weight="medium">
            {t("dashboard.discordPromo.title")}
          </Text>
          <Text as="div" size="2" color="gray">
            {t("dashboard.discordPromo.body")}
          </Text>
        </Box>
        <Flex gap="2" align="center" style={{ flexShrink: 0 }}>
          <Button size="2" color="iris" asChild>
            <Link href="/settings">
              {t("dashboard.discordPromo.connect")}
            </Link>
          </Button>
          <IconButton
            size="2"
            variant="ghost"
            color="gray"
            onClick={onDismiss}
            aria-label={t("dashboard.discordPromo.dismiss")}
          >
            <Cross1Icon />
          </IconButton>
        </Flex>
      </Flex>
    </Box>
  );
}
