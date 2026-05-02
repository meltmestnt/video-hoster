"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { Cross1Icon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useUpload, isUploadBusy } from "@/lib/upload-context";
import { useRequireAuth } from "@/lib/auth-required";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import { useT } from "@/lib/i18n";
import { ConvertDialog } from "./ConvertDialog";
import { UploadProgressBar } from "./UploadProgressBar";
import { UploadSuccessToast } from "./UploadSuccessToast";
import { UserMenu } from "./UserMenu";
import { NotificationsBell } from "./NotificationsBell";

interface TopBarProps {
  signedIn: boolean;
  userName: string | null;
  userEmail: string | null;
  avatarUrl: string | null;
  videoCount: number;
  gifCount: number;
  telegramLinked: boolean;
  verified: boolean;
  miniPlayerEnabled: boolean;
  isAdmin: boolean;
}

export function TopBar({
  signedIn,
  userName,
  userEmail,
  avatarUrl,
  videoCount,
  gifCount,
  telegramLinked,
  verified,
  miniPlayerEnabled,
  isAdmin,
}: TopBarProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;
  const uploadDisabled = busy || otherTabBusy;
  const requireAuth = useRequireAuth();
  const uploadDialog = useUploadDialog();
  const t = useT();

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const onGifs = pathname === "/gifs" || pathname.startsWith("/gifs/");
  const onVideos = pathname === "/videos" || pathname.startsWith("/videos/");
  const uploadLabel = onGifs
    ? t("topbar.uploadGif")
    : onVideos
      ? t("topbar.uploadVideo")
      : t("topbar.upload");
  const uploadTooltip = onGifs
    ? t("topbar.uploadTooltip.gif")
    : onVideos
      ? t("topbar.uploadTooltip.video")
      : t("topbar.uploadTooltip.any");
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Close the mobile drawer when the route changes (e.g. user tapped a nav
  // link inside the drawer) so they don't have to dismiss it themselves.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setDrawerOpen(false);
  };

  const openUpload = () => {
    if (uploadDisabled) return;
    if (onGifs) {
      uploadDialog.openGifUpload();
    } else {
      uploadDialog.openVideoUpload();
    }
    setDrawerOpen(false);
  };

  const openConvert = () => {
    setConvertOpen(true);
    setDrawerOpen(false);
  };

  const searchPlaceholder = signedIn
    ? t("topbar.search.placeholder.signedIn")
    : t("topbar.search.placeholder.signedOut");

  return (
    <Box
      className="app-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--gray-1)",
        borderBottom: "1px solid var(--gray-4)",
      }}
    >
      <Flex align="center" justify="between" px="4" py="3" gap="3">
        <Flex align="center" gap="3" style={{ minWidth: 0 }}>
          <Link href="/">
            <Heading size="5" style={{ letterSpacing: "-0.02em" }}>
              {t("site.name")}
            </Heading>
          </Link>
          <Box className="topbar-desktop-only">
            <TopBarNav />
          </Box>
          <Box
            asChild
            className="topbar-desktop-only"
            style={{ width: 280, maxWidth: "30vw" }}
          >
            <form onSubmit={submitSearch} role="search">
              <TextField.Root
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if (!signedIn) requireAuth();
                }}
                aria-label={t("topbar.search.aria")}
              />
            </form>
          </Box>
        </Flex>
        <Flex align="center" gap="3">
          {signedIn ? (
            <>
              <Box className="topbar-desktop-only">
                <Flex align="center" gap="3">
                  <Tooltip content={t("topbar.convertTooltip")}>
                    <Button
                      size="2"
                      variant="soft"
                      color="gray"
                      onClick={() => setConvertOpen(true)}
                    >
                      {t("topbar.convert")}
                    </Button>
                  </Tooltip>
                  <Tooltip
                    content={
                      otherTabBusy
                        ? t("topbar.uploadTooltip.otherTabBusy")
                        : busy
                          ? t("topbar.uploadTooltip.busy")
                          : uploadTooltip
                    }
                  >
                    <Button
                      size="2"
                      variant="solid"
                      onClick={openUpload}
                      disabled={uploadDisabled}
                    >
                      {uploadLabel}
                    </Button>
                  </Tooltip>
                </Flex>
              </Box>
              <NotificationsBell />
              <UserMenu
                name={userName ?? ""}
                email={userEmail ?? ""}
                avatarUrl={avatarUrl}
                videoCount={videoCount}
                gifCount={gifCount}
                telegramLinked={telegramLinked}
                verified={verified}
                miniPlayerEnabled={miniPlayerEnabled}
                isAdmin={isAdmin}
              />
            </>
          ) : (
            <Box className="topbar-desktop-only">
              <Flex align="center" gap="3">
                <Button asChild size="2" variant="soft">
                  <Link href="/login">{t("topbar.signIn")}</Link>
                </Button>
                <Button asChild size="2" variant="solid">
                  <Link href="/signup">{t("topbar.signUp")}</Link>
                </Button>
              </Flex>
            </Box>
          )}
          <Box className="topbar-mobile-only">
            <IconButton
              variant="soft"
              color="gray"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label={t("topbar.menu.toggle")}
              aria-expanded={drawerOpen}
            >
              {drawerOpen ? <Cross1Icon /> : <HamburgerMenuIcon />}
            </IconButton>
          </Box>
        </Flex>
      </Flex>

      {drawerOpen && (
        <Box className="topbar-drawer topbar-mobile-only">
          <Flex direction="column" gap="3" px="4" py="4">
            <form onSubmit={submitSearch} role="search">
              <TextField.Root
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => {
                  if (!signedIn) requireAuth();
                }}
                aria-label={t("topbar.search.aria")}
              />
            </form>
            <Flex direction="column" gap="1">
              {NAV_ITEMS.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="topbar-drawer-link"
                    onClick={() => setDrawerOpen(false)}
                  >
                    {t(item.labelKey)}
                  </Link>
                );
              })}
            </Flex>
            {signedIn ? (
              <Flex direction="column" gap="2">
                <Button
                  size="3"
                  variant="soft"
                  color="gray"
                  onClick={openConvert}
                >
                  {t("topbar.convert")}
                </Button>
                <Button
                  size="3"
                  variant="solid"
                  onClick={openUpload}
                  disabled={uploadDisabled}
                >
                  {uploadLabel}
                </Button>
              </Flex>
            ) : (
              <Flex direction="column" gap="2">
                <Button asChild size="3" variant="soft">
                  <Link
                    href="/login"
                    onClick={() => setDrawerOpen(false)}
                  >
                    {t("topbar.signIn")}
                  </Link>
                </Button>
                <Button asChild size="3" variant="solid">
                  <Link
                    href="/signup"
                    onClick={() => setDrawerOpen(false)}
                  >
                    {t("topbar.signUp")}
                  </Link>
                </Button>
              </Flex>
            )}
          </Flex>
        </Box>
      )}

      <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} />
      {signedIn && (
        <>
          <UploadProgressBar />
          <UploadSuccessToast />
        </>
      )}
    </Box>
  );
}

const NAV_ITEMS: Array<{
  href: string;
  labelKey:
    | "topbar.nav.all"
    | "topbar.nav.videos"
    | "topbar.nav.gifs"
    | "topbar.nav.screenshots";
  match: (p: string) => boolean;
}> = [
  { href: "/all", labelKey: "topbar.nav.all", match: (p) => p === "/all" },
  {
    href: "/videos",
    labelKey: "topbar.nav.videos",
    match: (p) => p === "/videos" || p.startsWith("/videos/"),
  },
  {
    href: "/gifs",
    labelKey: "topbar.nav.gifs",
    match: (p) => p === "/gifs" || p.startsWith("/gifs/"),
  },
  {
    href: "/screenshots",
    labelKey: "topbar.nav.screenshots",
    match: (p) =>
      p === "/screenshots" || p.startsWith("/screenshots/"),
  },
];

function TopBarNav() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  return (
    <Flex gap="1" align="center">
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              color: active ? "var(--gray-12)" : "var(--gray-11)",
              background: active ? "var(--gray-4)" : "transparent",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </Flex>
  );
}
