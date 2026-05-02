"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArchiveIcon,
  Cross1Icon,
  MagnifyingGlassIcon,
  PaperPlaneIcon,
  Share1Icon,
} from "@radix-ui/react-icons";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
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

interface MiniTile {
  Icon: typeof ArchiveIcon;
  titleKey: TKey;
  descKey: TKey;
}

const TILES: MiniTile[] = [
  {
    Icon: ArchiveIcon,
    titleKey: "folderHero.tile.private.title",
    descKey: "folderHero.tile.private.desc",
  },
  {
    Icon: Share1Icon,
    titleKey: "folderHero.tile.share.title",
    descKey: "folderHero.tile.share.desc",
  },
  {
    Icon: MagnifyingGlassIcon,
    titleKey: "folderHero.tile.telegram.title",
    descKey: "folderHero.tile.telegram.desc",
  },
];

/**
 * Dashboard hero pitching the two-step "create your library, then share
 * it" flow. Stays visible for every signed-in user until they dismiss
 * — folders alone are useful, but sharing is the killer feature most
 * users never discover unless we tell them. Uses the same iris-tinted
 * gradient + grid backdrop as AnonFoldersPromo so the signed-out and
 * signed-in pitches read as the same family.
 */
export function FolderOnboardingBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const [dismissed, setDismissed] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  if (dismissed) return null;
  if (!me.data) return null;

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
          borderRadius: "var(--radius-5)",
          background:
            "radial-gradient(circle at 0% 0%, rgba(125, 102, 255, 0.28) 0%, transparent 55%), " +
            "radial-gradient(circle at 100% 100%, rgba(125, 102, 255, 0.16) 0%, transparent 50%), " +
            "linear-gradient(180deg, var(--gray-2) 0%, var(--gray-1) 100%)",
          border: "1px solid var(--gray-5)",
          padding: "32px",
          marginBottom: 24,
        }}
      >
        <Box
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), " +
              "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <IconButton
          size="2"
          variant="ghost"
          color="gray"
          onClick={onDismiss}
          aria-label={t("folderHero.dismiss")}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 3,
          }}
        >
          <Cross1Icon />
        </IconButton>

        <Flex
          direction="column"
          gap="3"
          align="start"
          style={{ position: "relative", zIndex: 2 }}
        >
          <Badge
            color="iris"
            variant="surface"
            radius="full"
            style={{ paddingInline: 12 }}
          >
            <ArchiveIcon width="12" height="12" />
            <Text size="1" weight="medium" ml="1">
              {t("folderHero.badge")}
            </Text>
          </Badge>
          <Heading
            size="7"
            style={{
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              maxWidth: 760,
              paddingRight: 32,
            }}
          >
            {t("folderHero.headline.before")}{" "}
            <Text
              as="span"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--iris-9) 0%, #c5b6ff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {t("folderHero.headline.highlight")}
            </Text>
          </Heading>
          <Text
            as="p"
            size="3"
            color="gray"
            style={{ maxWidth: 680, lineHeight: 1.5 }}
          >
            {t("folderHero.subtitle")}
          </Text>

          <Box
            mt="3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              width: "100%",
            }}
          >
            {TILES.map(({ Icon, titleKey, descKey }) => (
              <Flex
                key={titleKey}
                direction="column"
                gap="2"
                align="start"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.01) 100%)",
                  border: "1px solid var(--gray-5)",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <Box
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "var(--iris-4)",
                    color: "var(--iris-11)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "inset 0 0 0 1px var(--iris-6)",
                  }}
                >
                  <Icon width="18" height="18" />
                </Box>
                <Text as="div" size="3" weight="medium">
                  {t(titleKey)}
                </Text>
                <Text
                  as="div"
                  size="2"
                  color="gray"
                  style={{ lineHeight: 1.45 }}
                >
                  {t(descKey)}
                </Text>
              </Flex>
            ))}
          </Box>

          <Flex gap="3" mt="3" wrap="wrap" align="center">
            <Button
              size="3"
              color="iris"
              onClick={() => setCreateOpen(true)}
            >
              <PaperPlaneIcon width="14" height="14" />
              {t("folderHero.cta.create")}
            </Button>
            <Button asChild size="3" variant="soft" color="iris">
              <Link href="/folders">{t("folderHero.cta.myFolders")}</Link>
            </Button>
            <Button asChild size="3" variant="ghost" color="iris">
              <Link href="/folders/shared">
                {t("folderHero.cta.sharedWithMe")} →
              </Link>
            </Button>
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
