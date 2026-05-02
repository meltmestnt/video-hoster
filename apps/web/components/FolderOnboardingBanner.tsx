"use client";

import { useEffect, useState } from "react";
import {
  ArchiveIcon,
  Cross1Icon,
  PaperPlaneIcon,
} from "@radix-ui/react-icons";
import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { FolderCreateDialog } from "./FolderCreateDialog";

const DISMISSED_KEY = "folderOnboardingDismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* private mode — fine */
  }
}

/**
 * Dashboard nudge that pitches folders + Telegram bot scoping to users
 * who haven't created any folders yet. Auto-hides once the user has at
 * least one folder, or after a manual dismiss (persisted in localStorage
 * so it doesn't keep nagging the user who said no once). Sits below
 * TelegramPromoBanner — together they tell the full story: "connect the
 * bot, then organize your library."
 */
export function FolderOnboardingBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const folders = trpc.folders.list.useQuery(undefined, {
    // Only fire when we know the user is signed in. Avoids a flash of
    // "you have no folders" → "you have folders" during initial hydration.
    enabled: !!me.data,
  });
  // Default true so the banner never flashes during SSR / hydration —
  // we flip to the actual stored value once we're in the browser.
  const [dismissed, setDismissed] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (dismissed) return null;
  if (!me.data) return null;
  // Only nudge users who have zero folders. Once they create one, the
  // banner self-retires — they've already discovered the feature.
  if (!folders.data) return null;
  if (folders.data.length > 0) return null;

  const onDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <>
      <Box
        className="intro-card intro-card-iris"
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "var(--radius-4)",
          background:
            "radial-gradient(circle at 0% 0%, rgba(125, 102, 255, 0.18) 0%, transparent 55%), " +
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
            <ArchiveIcon width="20" height="20" />
          </Flex>
          <Box style={{ flex: 1, minWidth: 220 }}>
            <Text as="div" size="3" weight="medium">
              {t("folderOnboarding.title")}
            </Text>
            <Text
              as="div"
              size="2"
              color="gray"
              style={{ lineHeight: 1.45 }}
            >
              <PaperPlaneIcon
                width="12"
                height="12"
                style={{
                  display: "inline",
                  verticalAlign: "-2px",
                  marginRight: 4,
                  color: "var(--blue-11)",
                }}
              />
              {t("folderOnboarding.body")}
            </Text>
          </Box>
          <Flex gap="2" align="center" style={{ flexShrink: 0 }}>
            <Button
              size="2"
              color="iris"
              onClick={() => setCreateOpen(true)}
            >
              {t("folderOnboarding.cta")}
            </Button>
            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              onClick={onDismiss}
              aria-label={t("folderOnboarding.dismiss")}
            >
              <Cross1Icon />
            </IconButton>
          </Flex>
        </Flex>
      </Box>

      <FolderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          // The folders.list query auto-invalidates inside
          // FolderCreateDialog after a successful create, so the banner
          // will hide itself on the next render. No manual dismiss
          // needed — the user has accomplished the onboarding goal.
          setCreateOpen(false);
        }}
      />
    </>
  );
}
