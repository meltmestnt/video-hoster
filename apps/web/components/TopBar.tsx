"use client";

import { Box, Button, Flex, Heading, TextField, Tooltip } from "@radix-ui/themes";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useUpload, isUploadBusy } from "@/lib/upload-context";
import { useRequireAuth } from "@/lib/auth-required";
import { useT } from "@/lib/i18n";
import { UploadDialog } from "./UploadDialog";
import { GifUploadDialog } from "./GifUploadDialog";
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
  verified: boolean;
  miniPlayerEnabled: boolean;
}

export function TopBar({
  signedIn,
  userName,
  userEmail,
  avatarUrl,
  videoCount,
  verified,
  miniPlayerEnabled,
}: TopBarProps) {
  const [open, setOpen] = useState(false);
  const upload = useUpload();
  const busy = isUploadBusy(upload.status);
  const otherTabBusy = upload.otherTabUploading;
  const uploadDisabled = busy || otherTabBusy;
  const requireAuth = useRequireAuth();
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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

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
        <Link href="/">
          <Heading size="5" style={{ letterSpacing: "-0.02em" }}>
            {t("site.name")}
          </Heading>
        </Link>
        <TopBarNav />
        <Box asChild style={{ flex: 1, maxWidth: 520 }}>
          <form onSubmit={submitSearch} role="search">
            <TextField.Root
              placeholder={
                signedIn
                  ? t("topbar.search.placeholder.signedIn")
                  : t("topbar.search.placeholder.signedOut")
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (!signedIn) requireAuth();
              }}
              aria-label={t("topbar.search.aria")}
            />
          </form>
        </Box>
        <Flex align="center" gap="3">
          {signedIn ? (
            <>
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
                  onClick={() => !uploadDisabled && setOpen(true)}
                  disabled={uploadDisabled}
                >
                  {uploadLabel}
                </Button>
              </Tooltip>
              <NotificationsBell />
              <UserMenu
                name={userName ?? ""}
                email={userEmail ?? ""}
                avatarUrl={avatarUrl}
                videoCount={videoCount}
                verified={verified}
                miniPlayerEnabled={miniPlayerEnabled}
              />
            </>
          ) : (
            <>
              <Button asChild size="2" variant="soft">
                <Link href="/login">{t("topbar.signIn")}</Link>
              </Button>
              <Button asChild size="2" variant="solid">
                <Link href="/signup">{t("topbar.signUp")}</Link>
              </Button>
            </>
          )}
        </Flex>
      </Flex>
      {signedIn && (
        <>
          <UploadProgressBar />
          {onGifs ? (
            <GifUploadDialog open={open} onOpenChange={setOpen} />
          ) : (
            <UploadDialog open={open} onOpenChange={setOpen} />
          )}
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
  { href: "/", labelKey: "topbar.nav.all", match: (p) => p === "/" },
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
