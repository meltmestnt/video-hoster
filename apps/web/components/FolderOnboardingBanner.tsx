"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArchiveIcon,
  Cross1Icon,
  Share1Icon,
} from "@radix-ui/react-icons";
import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { FolderCreateDialog } from "./FolderCreateDialog";

// Per-user dismiss key so two accounts on the same browser don't
// share state — a fresh signup sees the banner even if a previous
// account dismissed it on this device.
function dismissKey(userId: string): string {
  return `folderOnboardingDismissed:${userId}`;
}

function readDismissed(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(dismissKey(userId), "1");
  } catch {
    /* private mode — fine */
  }
}

/**
 * Compact iris-tinted dashboard banner pitching folders + sharing to
 * signed-in users who haven't created any folders yet. Self-retires
 * once the user creates a folder (they've discovered the feature) or
 * if they manually dismiss. Single row on desktop, stacks on mobile.
 */
export function FolderOnboardingBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  // Don't gate folders.list on me.data — during the bootstrap window
  // (NextAuth session loading) me.data is briefly undefined/null, and a
  // disabled-then-enabled toggle adds a render the banner skips. Let
  // the query fire on mount; if we're anonymous the API will 401 and
  // folders.data stays undefined, which the !folders.data check below
  // already handles.
  const folders = trpc.folders.list.useQuery();
  const [mounted, setMounted] = useState(false);
  // Bumping this on dismiss forces a re-render so the synchronous
  // localStorage read below picks up the new value without going
  // through useState/useEffect timing.
  const [dismissTick, setDismissTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  // Mark the component as hydrated. Pre-mount we render null to keep
  // SSR and the first client paint identical — without this guard the
  // banner could flash in then disappear (or not appear at all) due to
  // an effect-driven dismiss read racing the auth.me query.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (!me.data) return null;
  // Wait for the folders query to resolve — otherwise the banner flashes
  // in for the loading window even when the user has folders already.
  if (!folders.data) return null;
  if (folders.data.length > 0) return null;

  const userId = me.data.id;
  // dismissTick is referenced so React keeps it in the dependency
  // graph for re-renders — value itself doesn't matter.
  void dismissTick;
  if (readDismissed(userId)) return null;

  const onDismiss = () => {
    writeDismissed(userId);
    setDismissTick((n) => n + 1);
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
            "radial-gradient(circle at 0% 0%, rgba(125, 102, 255, 0.22) 0%, transparent 55%), " +
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
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--iris-3)",
              color: "var(--iris-11)",
              flexShrink: 0,
              boxShadow: "inset 0 0 0 1px var(--iris-6)",
              position: "relative",
            }}
            aria-hidden
          >
            <ArchiveIcon width="22" height="22" />
            {/* Tiny share badge in the corner — visual hint that this
                isn't just folders, it's folders + sharing. */}
            <Box
              style={{
                position: "absolute",
                bottom: -4,
                right: -4,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "var(--iris-9)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--gray-1)",
              }}
            >
              <Share1Icon width="10" height="10" />
            </Box>
          </Flex>
          <Box style={{ flex: 1, minWidth: 240 }}>
            <Text as="div" size="3" weight="medium">
              {t("folderHero.title")}
            </Text>
            <Text
              as="div"
              size="2"
              color="gray"
              style={{ lineHeight: 1.45 }}
            >
              {t("folderHero.subtitle")}
            </Text>
          </Box>
          <Flex gap="2" align="center" wrap="wrap" style={{ flexShrink: 0 }}>
            <Button
              size="2"
              color="iris"
              onClick={() => setCreateOpen(true)}
            >
              {t("folderHero.cta.create")}
            </Button>
            <Button asChild size="2" variant="soft" color="iris">
              <Link href="/folders/shared">
                {t("folderHero.cta.sharedWithMe")}
              </Link>
            </Button>
            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              onClick={onDismiss}
              aria-label={t("folderHero.dismiss")}
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
          setCreateOpen(false);
        }}
      />
    </>
  );
}
