"use client";

import { useState } from "react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

/**
 * Settings row for the Telegram bot link. Mirrors the layout of the
 * mini-player and notify-subscribers rows so it sits naturally inside
 * the user popover. Clicking "Connect" issues a one-time deep-link token
 * server-side and opens t.me/<bot>?start=<token> in a new tab.
 */
export function TelegramConnectRow() {
  const t = useT();
  const utils = trpc.useUtils();
  // The link gets created in another tab/app (Telegram), so the settings
  // page needs to actively pick the change up: refetch on focus, refetch
  // on every mount, and poll while we're still showing "Connect" so the
  // row flips to "Linked" within seconds of the user finishing the bot
  // /start step. Once linked we stop polling — the user can still hit
  // Unlink to clear, which triggers a normal invalidate.
  const status = trpc.telegram.status.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.linked ? false : 5000,
  });
  const startLink = trpc.telegram.startLink.useMutation();
  const unlink = trpc.telegram.unlink.useMutation({
    onSuccess: () => utils.telegram.status.invalidate(),
  });
  const [error, setError] = useState<string | null>(null);

  const onConnect = async () => {
    setError(null);
    try {
      const { url } = await startLink.mutateAsync();
      // Open in a new tab — Telegram apps intercept t.me URLs and hand
      // the deep-link token to the bot. If Telegram isn't installed the
      // user falls through to the web client at the same URL.
      window.open(url, "_blank", "noopener,noreferrer");
      // Kick the status query immediately too — if the bot finishes
      // linking before the next 5s poll tick, the row flips on the
      // user's next focus return without waiting.
      void utils.telegram.status.invalidate();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onUnlink = async () => {
    setError(null);
    try {
      await unlink.mutateAsync();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Hide the row entirely when the API tells us the bot isn't configured
  // (startLink throws PRECONDITION_FAILED). Keeps the popover from
  // dangling a useless setting on dev environments without the env var.
  if (
    startLink.error?.data?.code === "PRECONDITION_FAILED" &&
    !status.data?.linked
  ) {
    return null;
  }

  const linked = !!status.data?.linked;
  const handle = status.data?.telegramUsername;

  return (
    <Flex justify="between" align="center" px="1" gap="3">
      <Box style={{ minWidth: 0 }}>
        <Text as="div" size="2" color="gray">
          {t("user.profile.telegram.label")}
        </Text>
        <Text as="div" size="1" color="gray">
          {linked
            ? handle
              ? t("user.profile.telegram.connectedAs", { handle: `@${handle}` })
              : t("user.profile.telegram.connected")
            : t("user.profile.telegram.hint")}
        </Text>
        {error && (
          <Text as="div" size="1" color="red" mt="1">
            {error}
          </Text>
        )}
      </Box>
      {linked ? (
        <Button
          size="1"
          variant="soft"
          color="gray"
          onClick={onUnlink}
          disabled={unlink.isPending}
        >
          {unlink.isPending
            ? t("user.profile.telegram.unlinking")
            : t("user.profile.telegram.unlink")}
        </Button>
      ) : (
        <Button
          size="1"
          variant="soft"
          color="iris"
          onClick={onConnect}
          disabled={startLink.isPending}
        >
          {startLink.isPending
            ? t("user.profile.telegram.connecting")
            : t("user.profile.telegram.connect")}
        </Button>
      )}
    </Flex>
  );
}
