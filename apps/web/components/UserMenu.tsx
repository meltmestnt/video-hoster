"use client";

import {
  AlertDialog,
  Avatar,
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Popover,
  Switch,
  Text,
} from "@radix-ui/themes";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  GearIcon,
  PaperPlaneIcon,
  PersonIcon,
  StarIcon,
} from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { usePushSubscription } from "@/lib/push";
import { AvatarUploadPane } from "./AvatarUploadPane";
import { AvatarEditPane } from "./AvatarEditPane";
import { Morph } from "./Morph";
import { OpenInTelegramButton } from "./OpenInTelegramButton";

type View = "profile" | "upload" | "edit";

interface Props {
  name: string;
  email: string;
  avatarUrl: string | null;
  videoCount: number;
  gifCount: number;
  telegramLinked: boolean;
  verified: boolean;
  miniPlayerEnabled: boolean;
  // Resolved from the server-rendered layout's auth.me call so the admin
  // link appears on the very first menu open instead of waiting for the
  // client-side useQuery to land.
  isAdmin: boolean;
}

export function UserMenu({
  name,
  email,
  avatarUrl,
  videoCount,
  gifCount,
  telegramLinked,
  verified,
  miniPlayerEnabled,
  isAdmin,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("profile");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(avatarUrl);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const createUpload = trpc.users.createAvatarUpload.useMutation();
  const finalizeUpload = trpc.users.finalizeAvatarUpload.useMutation();
  const t = useT();

  const reset = () => {
    setView("profile");
    setFile(null);
    setError(null);
    setBusy(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  // Close the popover whenever the route or query changes — clicking a link
  // inside the menu (Favorites, Subscriptions, etc.) leaves it stuck open
  // otherwise, since Next App Router navigation doesn't unmount the trigger.
  useEffect(() => {
    setOpen(false);
    reset();
  }, [pathname, searchParams]);

  const handleSave = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const created = await createUpload.mutateAsync({
        mimeType: "image/jpeg",
        sizeBytes: blob.size,
      });
      const putRes = await fetch(created.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      const finalized = await finalizeUpload.mutateAsync({
        s3Key: created.s3Key,
      });
      setLiveAvatarUrl(finalized.avatarUrl);
      await utils.auth.me.invalidate();
      router.refresh();
      reset();
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const displayAvatar = liveAvatarUrl ?? avatarUrl;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>
        <button
          aria-label={t("user.menu.aria", { name })}
          style={{
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            borderRadius: 999,
            transition: "transform 120ms ease, box-shadow 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.boxShadow = "";
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translateY(1px) scale(0.95)";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
        >
          <Avatar
            size="3"
            src={displayAvatar ?? undefined}
            fallback={name.slice(0, 1).toUpperCase()}
            radius="full"
          />
        </button>
      </Popover.Trigger>
      <Popover.Content
        size="2"
        align="end"
        style={{ width: 312, overflow: "hidden" }}
      >
        <Morph viewKey={view} axis="height" style={{ width: 280 }}>
          {view === "profile" && (
            <ProfilePane
              name={name}
              email={email}
              avatarUrl={displayAvatar}
              videoCount={videoCount}
              gifCount={gifCount}
              telegramLinked={telegramLinked}
              verified={verified}
              miniPlayerEnabled={miniPlayerEnabled}
              isAdmin={isAdmin}
              onChangeAvatar={() => setView("upload")}
            />
          )}
          {view === "upload" && (
            <AvatarUploadPane
              onPick={(f) => {
                setFile(f);
                setView("edit");
              }}
              onBack={() => setView("profile")}
            />
          )}
          {view === "edit" && file && (
            <AvatarEditPane
              file={file}
              busy={busy}
              errorMessage={error}
              onCancel={() => {
                if (busy) return;
                setFile(null);
                setError(null);
                setView("upload");
              }}
              onSave={handleSave}
            />
          )}
        </Morph>
      </Popover.Content>
    </Popover.Root>
  );
}

interface ProfilePaneProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  videoCount: number;
  gifCount: number;
  telegramLinked: boolean;
  verified: boolean;
  miniPlayerEnabled: boolean;
  isAdmin: boolean;
  onChangeAvatar: () => void;
}

function ProfilePane({
  name,
  email,
  avatarUrl,
  videoCount,
  gifCount,
  telegramLinked,
  verified,
  miniPlayerEnabled,
  isAdmin,
  onChangeAvatar,
}: ProfilePaneProps) {
  const t = useT();
  // Drives the conditional admin/billing buttons; same source of truth
  // the rest of the menu used before the toggle rows moved to /settings.
  const me = trpc.auth.me.useQuery();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteSelf = trpc.users.deleteSelf.useMutation();
  const confirmDeleteSelf = async () => {
    setDeleteError(null);
    try {
      await deleteSelf.mutateAsync();
      // Sign out after the row is gone — the session token is now backed by
      // a missing user, so any further requests would 401 anyway.
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  return (
    <Flex direction="column" gap="3" style={{ width: 280 }}>
      <Flex gap="3" align="center">
        <button
          type="button"
          onClick={onChangeAvatar}
          aria-label={t("user.profile.changeAvatar")}
          title={t("user.profile.changeAvatar")}
          style={{
            border: 0,
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            borderRadius: 999,
            position: "relative",
          }}
        >
          <Avatar
            size="5"
            src={avatarUrl ?? undefined}
            fallback={name.slice(0, 1).toUpperCase()}
            radius="full"
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: 999,
              background: "var(--accent-9)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              border: "2px solid var(--gray-1)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            ✎
          </span>
        </button>
        <Box style={{ minWidth: 0 }}>
          <Flex align="center" gap="2">
            <Text as="div" size="3" weight="medium" truncate>
              {name}
            </Text>
            <Badge
              color={verified ? "green" : "amber"}
              variant="soft"
              radius="full"
            >
              {verified
                ? t("user.profile.verified")
                : t("user.profile.unverified")}
            </Badge>
          </Flex>
          <Text as="div" size="1" color="gray" truncate>
            {email}
          </Text>
        </Box>
      </Flex>
      <Box
        style={{
          height: 1,
          background: "var(--gray-5)",
          margin: "4px 0",
        }}
      />
      <Flex direction="column" gap="2" px="1">
        <Flex justify="between" align="center">
          <Text size="2" color="gray">
            {t("user.profile.videosUploaded")}
          </Text>
          <Text size="2" weight="medium">
            {videoCount}
          </Text>
        </Flex>
        <Flex justify="between" align="center">
          <Text size="2" color="gray">
            {t("user.profile.gifsUploaded")}
          </Text>
          <Text size="2" weight="medium">
            {gifCount}
          </Text>
        </Flex>
        <Flex justify="between" align="center">
          <Flex align="center" gap="2">
            <PaperPlaneIcon />
            <Text size="2" color="gray">
              {t("user.profile.telegram.label")}
            </Text>
          </Flex>
          <Flex align="center" gap="1">
            {telegramLinked ? (
              <CheckCircledIcon
                style={{ color: "var(--green-10)" }}
                aria-hidden
              />
            ) : (
              <CrossCircledIcon
                style={{ color: "var(--gray-9)" }}
                aria-hidden
              />
            )}
            <Text
              size="2"
              weight="medium"
              color={telegramLinked ? "green" : "gray"}
            >
              {telegramLinked
                ? t("user.profile.telegram.statusConnected")
                : t("user.profile.telegram.statusDisconnected")}
            </Text>
          </Flex>
        </Flex>
      </Flex>
      <Box
        style={{
          height: 1,
          background: "var(--gray-5)",
          margin: "4px 0",
        }}
      />
      <Flex direction="column" gap="2">
        {/* Quick path to your own /@username page so you can see what
            other people see. Only shows once auth.me has resolved and we
            actually have a username slug — otherwise the link would 404. */}
        {me.data?.username && (
          <Button asChild variant="soft" color="iris">
            <Link href={`/@${me.data.username}`}>
              <PersonIcon /> {t("user.profile.viewProfile")}
            </Link>
          </Button>
        )}
        {/* All preferences (mini-player, push, notifications, telegram,
            language) live on /settings now — surface that as a single
            entry point rather than duplicating each row inline. */}
        <Button asChild variant="soft" color="gray">
          <Link href="/settings">
            <GearIcon /> {t("user.profile.settings")}
          </Link>
        </Button>
        {/* Direct deep-link to the bot — Telegram's name search is
            popularity-gated for newer bots, so this gives users a
            reliable one-tap path to find @vidsandgifsbot. */}
        <OpenInTelegramButton />
        <Button asChild variant="soft" color="iris">
          <Link href="/folders">
            <ArchiveIcon /> {t("folders.userMenu.link")}
          </Link>
        </Button>
        <Button asChild variant="soft" color="amber">
          <Link href="/favorites">
            <StarIcon /> {t("user.profile.favorites")}
          </Link>
        </Button>
        <Button asChild variant="soft" color="iris">
          <Link href="/subscriptions">
            {t("user.profile.subscriptions")}
          </Link>
        </Button>
        {/* Admins bypass the Pro paywall (proProcedure short-circuits for
            them, useTier() returns "pro"), so the billing page is just
            noise for them — hide it. Trust the server prop on first paint,
            let the live query take over once it lands. */}
        {!(me.data ? me.data.role === "admin" : isAdmin) && (
          <Button asChild variant="soft" color="iris">
            <Link href="/billing">{t("user.profile.billing")}</Link>
          </Button>
        )}
        {(me.data ? me.data.role === "admin" : isAdmin) && (
          <Button asChild variant="soft" color="red">
            <Link href="/manage">{t("user.profile.manage")}</Link>
          </Button>
        )}
        {(me.data ? me.data.role === "admin" : isAdmin) && (
          <Button asChild variant="soft" color="red">
            <Link href="/admin/folders">{t("userMenu.admin.folders")}</Link>
          </Button>
        )}
        <Button variant="soft" onClick={onChangeAvatar}>
          {t("user.profile.changeAvatar")}
        </Button>
        <Button
          color="gray"
          variant="soft"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {t("user.profile.signOut")}
        </Button>
        <AlertDialog.Root
          open={deleteOpen}
          onOpenChange={(o) => {
            setDeleteOpen(o);
            if (!o) setDeleteError(null);
          }}
        >
          <AlertDialog.Trigger>
            <Button color="red" variant="ghost">
              {t("user.profile.deleteAccount")}
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content maxWidth="440px">
            <AlertDialog.Title>{t("deleteAccount.title")}</AlertDialog.Title>
            <AlertDialog.Description size="2">
              {t("deleteAccount.body")}
            </AlertDialog.Description>
            {deleteError && (
              <Callout.Root color="red" mt="3">
                <Callout.Text>{deleteError}</Callout.Text>
              </Callout.Root>
            )}
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button
                  variant="soft"
                  color="gray"
                  disabled={deleteSelf.isPending}
                >
                  {t("common.cancel")}
                </Button>
              </AlertDialog.Cancel>
              <Button
                color="red"
                onClick={confirmDeleteSelf}
                disabled={deleteSelf.isPending}
              >
                {deleteSelf.isPending
                  ? t("deleteAccount.deleting")
                  : t("deleteAccount.confirm")}
              </Button>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Flex>
    </Flex>
  );
}

export function PushToggleRow() {
  const t = useT();
  const { status, enable, disable, error, isBusy } = usePushSubscription();

  // Hide the toggle entirely on platforms without Push support — there's
  // nothing to show or do.
  if (status === "unsupported") return null;

  const checked = status === "subscribed";
  const blocked = status === "blocked";
  const hint = blocked
    ? t("push.menu.blocked")
    : checked
      ? t("push.menu.hintOn")
      : t("push.menu.hintOff");

  return (
    <Flex justify="between" align="center" px="1" gap="3">
      <Box style={{ minWidth: 0 }}>
        <Text as="div" size="2" color="gray">
          {t("push.menu.label")}
        </Text>
        <Text as="div" size="1" color={error ? "red" : "gray"}>
          {error ? t("push.menu.failed") : hint}
        </Text>
      </Box>
      <Switch
        checked={checked}
        disabled={isBusy || blocked}
        onCheckedChange={(next) => {
          if (next) {
            void enable();
          } else {
            void disable();
          }
        }}
        aria-label={t("push.menu.toggleAria")}
      />
    </Flex>
  );
}
