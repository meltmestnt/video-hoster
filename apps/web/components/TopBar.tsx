"use client";

import {
  Box,
  Button,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  ChevronDownIcon,
  Cross1Icon,
  HamburgerMenuIcon,
  ImageIcon,
  PlusIcon,
  VideoIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useUpload, isUploadBusy } from "@/lib/upload-context";
import { useRequireAuth } from "@/lib/auth-required";
import { useUploadDialog } from "@/lib/upload-dialog-context";
import { useT } from "@/lib/i18n";
import { telegramBotUrl } from "@/lib/telegram-bot";
import { useVerifyRequired } from "./VerifyRequiredDialog";
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
  discordLinked: boolean;
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
  discordLinked,
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
  const verifyRequired = useVerifyRequired();
  const t = useT();

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? "/";
  const onGifs = pathname === "/gifs" || pathname.startsWith("/gifs/");
  const onVideos = pathname === "/videos" || pathname.startsWith("/videos/");
  // Any page that isn't a single-type feed (e.g. /all, /, /search,
  // profile pages) can't infer whether the user wants to upload a video
  // or a GIF. Those pages get a dropdown chooser; /videos and /gifs
  // keep their one-click direct action.
  const onAny = !onGifs && !onVideos;
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

  // Mirror the convert gate: the upload API rejects unverified accounts,
  // so opening the dialog is just a dead end. Centralized so the
  // direct-click button, the dropdown items, and the mobile drawer all
  // get the same gating without each having to remember it.
  const checkUploadGate = (): boolean => {
    if (uploadDisabled) return false;
    if (!verified) {
      setDrawerOpen(false);
      verifyRequired.show("action", "unverified");
      return false;
    }
    return true;
  };

  const openVideoUpload = () => {
    if (!checkUploadGate()) return;
    uploadDialog.openVideoUpload();
    setDrawerOpen(false);
  };

  const openGifUpload = () => {
    if (!checkUploadGate()) return;
    uploadDialog.openGifUpload();
    setDrawerOpen(false);
  };

  // Direct-click handler used on /videos and /gifs where the upload
  // type is unambiguous. On the "any" pages this is replaced by a
  // dropdown chooser, but the function stays useful as a fallback (e.g.
  // it's still wired to the mobile drawer's secondary buttons).
  const openUpload = () => {
    if (!checkUploadGate()) return;
    if (onGifs) {
      uploadDialog.openGifUpload();
    } else {
      uploadDialog.openVideoUpload();
    }
    setDrawerOpen(false);
  };

  const openConvert = () => {
    setDrawerOpen(false);
    // Conversion is a verified-only feature even though it's all done
    // client-side (ffmpeg.wasm) — keeps unverified accounts from using
    // the site as a free generic transcoder. Same gate the upload flows
    // use, just with kind="action" so the dialog copy doesn't talk
    // about uploading.
    if (!verified) {
      verifyRequired.show("action", "unverified");
      return;
    }
    setConvertOpen(true);
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
                      onClick={openConvert}
                    >
                      {t("topbar.convert")}
                    </Button>
                  </Tooltip>
                  {onAny ? (
                    <UploadChooserDropdown
                      label={uploadLabel}
                      disabled={uploadDisabled}
                      disabledReason={
                        otherTabBusy
                          ? t("topbar.uploadTooltip.otherTabBusy")
                          : busy
                            ? t("topbar.uploadTooltip.busy")
                            : null
                      }
                      onPickVideo={openVideoUpload}
                      onPickGif={openGifUpload}
                      videoLabel={t("topbar.uploadVideo")}
                      gifLabel={t("topbar.uploadGif")}
                    />
                  ) : (
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
                  )}
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
                discordLinked={discordLinked}
                verified={verified}
                miniPlayerEnabled={miniPlayerEnabled}
                isAdmin={isAdmin}
              />
            </>
          ) : (
            <Box className="topbar-desktop-only">
              <Flex align="center" gap="3">
                {/* Discoverability path to @vidsandgifsbot for anon
                    visitors — without this the bot lives only in the
                    footer and the marketing pitch on the landing page. */}
                <Button asChild size="2" variant="soft" color="gray">
                  <a
                    href={telegramBotUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("topbar.telegram")}
                  </a>
                </Button>
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
            <Flex align="center" gap="2">
              {signedIn &&
                (onAny ? (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                      {/* Native button instead of Radix IconButton because the
                          crimson running-border effect needs a ::before
                          pseudo-element with a custom mask + conic-gradient,
                          which conflicts with IconButton's own ::before for
                          the soft surface. .topbar-add-mobile owns the
                          visuals end-to-end. */}
                      <button
                        type="button"
                        className="topbar-add-mobile"
                        disabled={uploadDisabled}
                        aria-label={uploadLabel}
                      >
                        <PlusIcon />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item onSelect={openVideoUpload}>
                        <VideoIcon style={{ marginRight: 6 }} />
                        {t("topbar.uploadVideo")}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={openGifUpload}>
                        <ImageIcon style={{ marginRight: 6 }} />
                        {t("topbar.uploadGif")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                ) : (
                  <Tooltip
                    content={
                      otherTabBusy
                        ? t("topbar.uploadTooltip.otherTabBusy")
                        : busy
                          ? t("topbar.uploadTooltip.busy")
                          : uploadTooltip
                    }
                  >
                    <button
                      type="button"
                      className="topbar-add-mobile"
                      onClick={openUpload}
                      disabled={uploadDisabled}
                      aria-label={uploadLabel}
                    >
                      <PlusIcon />
                    </button>
                  </Tooltip>
                ))}
              <IconButton
                variant="soft"
                color="gray"
                onClick={() => setDrawerOpen((v) => !v)}
                aria-label={t("topbar.menu.toggle")}
                aria-expanded={drawerOpen}
              >
                {drawerOpen ? <Cross1Icon /> : <HamburgerMenuIcon />}
              </IconButton>
            </Flex>
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
                {onAny ? (
                  <>
                    <Button
                      size="3"
                      variant="solid"
                      onClick={openVideoUpload}
                      disabled={uploadDisabled}
                    >
                      {t("topbar.uploadVideo")}
                    </Button>
                    <Button
                      size="3"
                      variant="solid"
                      onClick={openGifUpload}
                      disabled={uploadDisabled}
                    >
                      {t("topbar.uploadGif")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="3"
                    variant="solid"
                    onClick={openUpload}
                    disabled={uploadDisabled}
                  >
                    {uploadLabel}
                  </Button>
                )}
              </Flex>
            ) : (
              <Flex direction="column" gap="2">
                <Button asChild size="3" variant="soft" color="gray">
                  <a
                    href={telegramBotUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDrawerOpen(false)}
                  >
                    {t("topbar.telegram")}
                  </a>
                </Button>
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

// Upload button for pages that aren't a single-type feed — clicking
// reveals a dropdown with Video and GIF options instead of guessing.
// Disabled state still shows a tooltip explaining why (busy / other tab
// busy); when enabled the tooltip is suppressed so it doesn't fight the
// dropdown popover for hover focus.
function UploadChooserDropdown({
  label,
  disabled,
  disabledReason,
  onPickVideo,
  onPickGif,
  videoLabel,
  gifLabel,
}: {
  label: string;
  disabled: boolean;
  disabledReason: string | null;
  onPickVideo: () => void;
  onPickGif: () => void;
  videoLabel: string;
  gifLabel: string;
}) {
  const trigger = (
    <Button size="2" variant="solid" disabled={disabled}>
      {label}
      <ChevronDownIcon />
    </Button>
  );
  if (disabled && disabledReason) {
    // Disabled triggers don't open the menu, so we render a plain
    // tooltip-wrapped button instead of a dropdown to surface the reason.
    return <Tooltip content={disabledReason}>{trigger}</Tooltip>;
  }
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item onSelect={onPickVideo}>
          <VideoIcon style={{ marginRight: 6 }} />
          {videoLabel}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={onPickGif}>
          <ImageIcon style={{ marginRight: 6 }} />
          {gifLabel}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

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
