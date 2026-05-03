"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Code,
  Flex,
  IconButton,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { CheckIcon, CopyIcon, ReloadIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";
import { useVerifyRequired } from "./VerifyRequiredDialog";

/**
 * Settings row for the Discord bot link. Discord doesn't have a deep-
 * link-with-payload like Telegram's `t.me/<bot>?start=<token>`, so the
 * UX is paste-the-code: server mints a one-time HMAC token, we show it
 * with a copy button + an Install link, and the user runs
 * `/link code:<paste>` in Discord to finish. The status query polls
 * every 5 s while showing "Connect" so the row flips to "Linked" within
 * seconds of the bot finishing on its end.
 */
export function DiscordConnectRow() {
  const t = useT();
  const utils = trpc.useUtils();
  const status = trpc.discord.status.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.linked ? false : 5000),
  });

  // Mirror TelegramConnectRow: refetch on visibility change for mobile
  // Safari / PWA contexts where focus events don't fire on app switch.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void utils.discord.status.invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [utils]);

  const startLink = trpc.discord.startLink.useMutation();
  const unlink = trpc.discord.unlink.useMutation({
    onSuccess: () => utils.discord.status.invalidate(),
  });
  const me = trpc.auth.me.useQuery();
  const verifyRequired = useVerifyRequired();

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    code: string;
    userInstallUrl: string | null;
    guildInstallUrl: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Once status flips to linked, drop the pending code panel — the user
  // is done with it and we don't want a stale code lingering on the
  // page.
  useEffect(() => {
    if (status.data?.linked && pending) setPending(null);
  }, [status.data?.linked, pending]);

  const onConnect = async () => {
    setError(null);
    trackEvent("Discord Connect", { source: "settings-row" });
    if (me.data && me.data.status !== "verified") {
      verifyRequired.show("action", "unverified");
      return;
    }
    try {
      const result = await startLink.mutateAsync();
      setPending({
        code: result.code,
        userInstallUrl: result.userInstallUrl,
        guildInstallUrl: result.guildInstallUrl,
      });
      // Auto-open the user-install URL — that's the path that works
      // for DMs and is what most people pitching themselves a personal
      // GIF bot want. The guild-install button stays available below
      // for users who explicitly want to add the bot to a server.
      if (result.userInstallUrl) {
        window.open(result.userInstallUrl, "_blank", "noopener,noreferrer");
      }
      void utils.discord.status.invalidate();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCopy = async () => {
    if (!pending) return;
    try {
      await navigator.clipboard.writeText(pending.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in non-secure contexts (older
      // self-hosted deploys, embedded webviews). The code stays on
      // screen so the user can manually select + copy.
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

  // Bot isn't configured server-side — startLink errors PRECONDITION_
  // FAILED. Hide the row entirely so a self-hosted dev environment
  // without DISCORD_BOT_TOKEN doesn't dangle a useless setting.
  if (
    startLink.error?.data?.code === "PRECONDITION_FAILED" &&
    !status.data?.linked
  ) {
    return null;
  }

  const linked = !!status.data?.linked;
  const handle = status.data?.discordUsername;

  return (
    <Flex direction="column" gap="2">
      <Flex justify="between" align="center" px="1" gap="3">
        <Box style={{ minWidth: 0 }}>
          <Text as="div" size="2" color="gray">
            {t("user.profile.discord.label")}
          </Text>
          <Text as="div" size="1" color="gray">
            {linked
              ? handle
                ? t("user.profile.discord.connectedAs", {
                    handle: `@${handle}`,
                  })
                : t("user.profile.discord.connected")
              : t("user.profile.discord.hint")}
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
              ? t("user.profile.discord.unlinking")
              : t("user.profile.discord.unlink")}
          </Button>
        ) : (
          <Flex gap="1" align="center">
            <Tooltip content={t("user.profile.discord.refresh")}>
              <IconButton
                size="1"
                variant="soft"
                color="gray"
                onClick={() => void utils.discord.status.invalidate()}
                disabled={status.isFetching}
                aria-label={t("user.profile.discord.refresh")}
              >
                <ReloadIcon
                  style={
                    status.isFetching
                      ? { animation: "spin 700ms linear infinite" }
                      : undefined
                  }
                />
              </IconButton>
            </Tooltip>
            <Button
              size="1"
              variant="soft"
              color="iris"
              onClick={onConnect}
              disabled={startLink.isPending}
            >
              {startLink.isPending
                ? t("user.profile.discord.connecting")
                : t("user.profile.discord.connect")}
            </Button>
          </Flex>
        )}
      </Flex>

      {pending && !linked && (
        <Box
          px="3"
          py="2"
          style={{
            border: "1px solid var(--gray-a5)",
            borderRadius: "var(--radius-3)",
            background: "var(--gray-a2)",
          }}
        >
          <Text as="div" size="1" color="gray" mb="1">
            {t("user.profile.discord.codeLabel")}
          </Text>
          <Flex align="center" gap="2" wrap="wrap" mb="2">
            <Code
              size="2"
              style={{
                wordBreak: "break-all",
                flex: 1,
                minWidth: 0,
                userSelect: "all",
              }}
            >
              {pending.code}
            </Code>
            <Button
              size="1"
              variant="soft"
              color={copied ? "green" : "gray"}
              onClick={onCopy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied
                ? t("user.profile.discord.codeCopied")
                : t("user.profile.discord.codeCopy")}
            </Button>
          </Flex>
          <Flex gap="2" wrap="wrap" align="center">
            {pending.userInstallUrl && (
              <Button size="1" variant="soft" color="iris" asChild>
                <a
                  href={pending.userInstallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("user.profile.discord.installUser")}
                </a>
              </Button>
            )}
            {pending.guildInstallUrl && (
              <Button size="1" variant="soft" color="gray" asChild>
                <a
                  href={pending.guildInstallUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("user.profile.discord.installGuild")}
                </a>
              </Button>
            )}
            <Text as="span" size="1" color="gray">
              {t("user.profile.discord.runCommand")}
            </Text>
          </Flex>
          <Flex justify="end" mt="2">
            <Button
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setPending(null)}
            >
              {t("user.profile.discord.dismiss")}
            </Button>
          </Flex>
        </Box>
      )}
    </Flex>
  );
}
