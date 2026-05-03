"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Flex,
  SegmentedControl,
  Separator,
  Switch,
  Text,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useLocale, useSetLocale, useT } from "@/lib/i18n";
import { PushToggleRow } from "./UserMenu";
import { TelegramConnectRow } from "./TelegramConnectRow";
import { DiscordConnectRow } from "./DiscordConnectRow";
import { OpenInTelegramButton } from "./OpenInTelegramButton";
import { FolderPickerSelect } from "./FolderPickerSelect";

interface Props {
  /** SSR-resolved miniPlayerEnabled so the toggle's first render
   *  doesn't flash to the default before the client-side query lands. */
  initialMiniPlayerEnabled: boolean;
  initialNotifySubscribersOnUpload: boolean;
}

/**
 * Standalone settings surface mirroring the rows inside the user popover.
 * The popover is the quick-access surface; this page is the long-form
 * version that the Telegram bot points users at, and what gets indexed by
 * autocomplete / linked-from emails. Kept identical row-for-row so users
 * don't see contradictory state between the two.
 */
export function SettingsForm({
  initialMiniPlayerEnabled,
  initialNotifySubscribersOnUpload,
}: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const setMiniPlayer = trpc.users.setMiniPlayerPreference.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const setNotify = trpc.users.setNotifySubscribersOnUpload.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  // Crucial: read raw values (no `?? true` default), so we can tell
  // "not yet loaded" (undefined) apart from "loaded as false". The
  // earlier `?? true` made the toggle's local state flip back to its
  // default whenever me.data was briefly undefined — exactly what
  // happens after a long blur, when TanStack lets the cached query
  // age out and the next render has no data until the refetch lands.
  const liveMini = me.data?.miniPlayerEnabled;
  const liveNotify = me.data?.notifySubscribersOnUpload;

  // Initialize from the SSR-resolved props so the toggle starts with the
  // right value on the first render — no flashing to a default while the
  // client query catches up.
  const [miniLocal, setMiniLocal] = useState<boolean>(initialMiniPlayerEnabled);
  const [notifyLocal, setNotifyLocal] = useState<boolean>(
    initialNotifySubscribersOnUpload,
  );
  // Once the live query lands with a known value, sync local state to
  // it — but never sync from undefined (which would flip a toggle to
  // its useState default mid-refetch).
  useEffect(() => {
    if (liveMini !== undefined) setMiniLocal(liveMini);
  }, [liveMini]);
  useEffect(() => {
    if (liveNotify !== undefined) setNotifyLocal(liveNotify);
  }, [liveNotify]);

  const locale = useLocale();
  const setLocale = useSetLocale();

  return (
    <Card size="3">
      <Flex direction="column" gap="4">
        <SettingRow
          label={t("user.profile.miniPlayer.label")}
          hint={t("user.profile.miniPlayer.hint")}
        >
          <Switch
            checked={miniLocal}
            disabled={setMiniPlayer.isPending}
            onCheckedChange={(next) => {
              const prev = miniLocal;
              setMiniLocal(next);
              setMiniPlayer.mutate(
                { enabled: next },
                { onError: () => setMiniLocal(prev) },
              );
            }}
            aria-label={t("user.profile.miniPlayer.toggleAria")}
          />
        </SettingRow>

        <Separator size="4" />

        <SettingRow
          label={t("user.profile.notifySubs.label")}
          hint={t("user.profile.notifySubs.hint")}
        >
          <Switch
            checked={notifyLocal}
            disabled={setNotify.isPending}
            onCheckedChange={(next) => {
              const prev = notifyLocal;
              setNotifyLocal(next);
              setNotify.mutate(
                { enabled: next },
                { onError: () => setNotifyLocal(prev) },
              );
            }}
            aria-label={t("user.profile.notifySubs.toggleAria")}
          />
        </SettingRow>

        <Separator size="4" />

        <PushToggleRow />

        <Separator size="4" />

        {/* "Open in Telegram" sits above the link/unlink row because
            it works for everyone, even users who haven't (or won't)
            link their account — useful for finding the bot at all
            since Telegram's name search is popularity-gated. */}
        <SettingRow
          label={t("telegram.openBot")}
          hint={t("telegram.openBot.hint")}
        >
          <OpenInTelegramButton size="1" />
        </SettingRow>

        <Separator size="4" />

        <TelegramConnectRow />

        <Separator size="4" />

        <TelegramActiveFolderRow />

        <Separator size="4" />

        <DiscordConnectRow />

        <Separator size="4" />

        <SettingRow label={t("user.profile.language")}>
          <SegmentedControl.Root
            size="1"
            value={locale}
            onValueChange={(v) => setLocale(v === "uk" ? "uk" : "en")}
          >
            <SegmentedControl.Item value="en">EN</SegmentedControl.Item>
            <SegmentedControl.Item value="uk">UK</SegmentedControl.Item>
          </SegmentedControl.Root>
        </SettingRow>
      </Flex>
    </Card>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Flex justify="between" align="center" gap="3">
      <Box style={{ minWidth: 0 }}>
        <Text as="div" size="2">
          {label}
        </Text>
        {hint && (
          <Text as="div" size="1" color="gray">
            {hint}
          </Text>
        )}
      </Box>
      {children}
    </Flex>
  );
}

/**
 * Picks which folder the user's Telegram bot operates against. Only
 * meaningful when the Telegram link exists, so the picker is disabled
 * (with an explanatory hint) when the link is missing.
 */
function TelegramActiveFolderRow() {
  const t = useT();
  const utils = trpc.useUtils();
  const status = trpc.telegram.status.useQuery();
  const active = trpc.folders.getTelegramActiveFolder.useQuery();
  const set = trpc.folders.setTelegramActiveFolder.useMutation({
    onSuccess: () => utils.folders.getTelegramActiveFolder.invalidate(),
  });
  const linked = !!status.data?.linked;
  const value = active.data?.folderId ?? null;

  const onChange = (next: string | null) => {
    set.mutate({ folderId: next });
  };

  return (
    <Flex justify="between" align="center" gap="3" wrap="wrap">
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text as="div" size="2">
          {t("settings.folders.label")}
        </Text>
        <Text as="div" size="1" color="gray">
          {t("settings.folders.hint")}
        </Text>
        {!linked && (
          <Text as="div" size="1" color="gray" mt="1">
            {t("settings.folders.linkRequired")}
          </Text>
        )}
        {set.error && (
          <Text as="div" size="1" color="red" mt="1">
            {set.error.message}
          </Text>
        )}
      </Box>
      <FolderPickerSelect
        value={value}
        onChange={onChange}
        disabled={!linked || set.isPending || active.isLoading}
        noneLabel={t("settings.folders.none")}
        ariaLabel={t("settings.folders.label")}
      />
    </Flex>
  );
}
