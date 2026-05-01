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

/**
 * Standalone settings surface mirroring the rows inside the user popover.
 * The popover is the quick-access surface; this page is the long-form
 * version that the Telegram bot points users at, and what gets indexed by
 * autocomplete / linked-from emails. Kept identical row-for-row so users
 * don't see contradictory state between the two.
 */
export function SettingsForm() {
  const t = useT();
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const setMiniPlayer = trpc.users.setMiniPlayerPreference.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const setNotify = trpc.users.setNotifySubscribersOnUpload.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const liveMini = me.data?.miniPlayerEnabled ?? true;
  const liveNotify = me.data?.notifySubscribersOnUpload ?? true;

  // Local mirrors so the toggle gives instant feedback while the mutation
  // is in flight; we revert on error to keep the UI honest.
  const [miniLocal, setMiniLocal] = useState(liveMini);
  const [notifyLocal, setNotifyLocal] = useState(liveNotify);
  useEffect(() => setMiniLocal(liveMini), [liveMini]);
  useEffect(() => setNotifyLocal(liveNotify), [liveNotify]);

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

        <TelegramConnectRow />

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
