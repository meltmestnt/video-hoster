"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Popover,
  ScrollArea,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { BellIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { Morph } from "./Morph";

const POLL_MS = 30_000;

function useTimeAgo() {
  const t = useT();
  return (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Math.max(0, Date.now() - d.getTime());
    const s = Math.floor(diff / 1000);
    if (s < 60) return t("notifications.time.secondsAgo", { n: s });
    const m = Math.floor(s / 60);
    if (m < 60) return t("notifications.time.minutesAgo", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("notifications.time.hoursAgo", { n: h });
    const days = Math.floor(h / 24);
    if (days < 7) return t("notifications.time.daysAgo", { n: days });
    return d.toLocaleDateString();
  };
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const t = useT();
  const timeAgo = useTimeAgo();

  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const list = trpc.notifications.list.useQuery(
    { limit: 20 },
    { enabled: open, staleTime: 0 },
  );

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.setData(undefined, 0);
      utils.notifications.list.invalidate();
    },
  });

  // When the popover opens, fire markAllRead so the badge clears immediately.
  // We don't wait for the response — the optimistic count update lives in the
  // mutation's onSuccess, but the list still shows read/unread state from the
  // first fetch so the user can see what's new for this session.
  useEffect(() => {
    if (open && (unread.data ?? 0) > 0) {
      markAllRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = unread.data ?? 0;
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={t("notifications.title")}>
        <Popover.Trigger>
          <IconButton
            size="2"
            variant="soft"
            color="gray"
            aria-label={
              count
                ? t("notifications.aria.unread", { n: count })
                : t("notifications.aria")
            }
            style={{ position: "relative" }}
          >
            <BellIcon />
            {count > 0 && (
              <Box
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: "var(--iris-9)",
                  color: "white",
                  borderRadius: 999,
                  fontSize: 10,
                  lineHeight: 1,
                  fontWeight: 600,
                  padding: "3px 5px",
                  minWidth: 16,
                  textAlign: "center",
                  border: "1px solid var(--gray-1)",
                }}
              >
                {count > 99 ? "99+" : count}
              </Box>
            )}
          </IconButton>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Content size="2" style={{ width: 360, padding: 0 }}>
        <Morph
          axis="height"
          style={{ width: 360 }}
          viewKey={
            list.isLoading ? "loading" : items.length === 0 ? "empty" : "list"
          }
        >
          <Flex
            align="center"
            justify="between"
            px="3"
            py="2"
            style={{ borderBottom: "1px solid var(--gray-4)" }}
          >
            <Text size="2" weight="medium">
              {t("notifications.title")}
            </Text>
            {items.length > 0 && (
              <Badge color="gray" variant="soft">
                {items.length}
              </Badge>
            )}
          </Flex>
          <ScrollArea style={{ maxHeight: 420 }}>
            {list.isLoading ? (
              <Box p="4">
                <Text size="2" color="gray">
                  {t("notifications.loading")}
                </Text>
              </Box>
            ) : items.length === 0 ? (
              <Box p="4">
                <Text size="2" color="gray">
                  {t("notifications.empty")}
                </Text>
              </Box>
            ) : (
            <Flex direction="column">
              {items.map((n) => {
                const href =
                  n.subject.kind === "video"
                    ? `/videos/${n.subject.id}`
                    : n.subject.kind === "gif"
                      ? `/gifs/${n.subject.id}`
                      : "/notifications";
                return (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => setOpen(false)}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <Flex
                      gap="3"
                      align="center"
                      px="3"
                      py="2"
                      style={{
                        background: n.readAt ? undefined : "var(--iris-2)",
                        borderBottom: "1px solid var(--gray-3)",
                        cursor: "pointer",
                      }}
                    >
                      <Avatar
                        size="2"
                        radius="full"
                        src={n.actor.avatarUrl ?? undefined}
                        fallback={(n.actor.name || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      />
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="2" as="div">
                          <Text weight="medium">{n.actor.name}</Text>{" "}
                          <Text color="gray">
                            {n.type === "gif_like"
                              ? t("notifications.likedGif")
                              : n.type === "video_like"
                                ? t("notifications.likedVideo")
                                : n.type === "gif_upload"
                                  ? t("notifications.uploadedGif")
                                  : n.type === "subscribe"
                                    ? t("notifications.subscribed")
                                    : t("notifications.uploadedVideo")}
                          </Text>{" "}
                          {n.type !== "subscribe" && (
                            <Text
                              weight="medium"
                              style={{
                                display: "inline-block",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                verticalAlign: "bottom",
                              }}
                            >
                              {n.subject.title}
                            </Text>
                          )}
                        </Text>
                        <Text size="1" color="gray">
                          {timeAgo(n.createdAt)}
                        </Text>
                      </Box>
                      {n.subject.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.subject.thumbnailUrl}
                          alt=""
                          style={{
                            width: 56,
                            height: 32,
                            objectFit: "cover",
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </Flex>
                  </Link>
                );
              })}
            </Flex>
          )}
        </ScrollArea>
          {items.length > 0 && (
            <Flex
              justify="end"
              px="3"
              py="2"
              style={{ borderTop: "1px solid var(--gray-4)" }}
            >
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => markAllRead.mutate()}
                disabled={count === 0 && items.every((i) => i.readAt)}
              >
                {t("notifications.markAll")}
              </Button>
            </Flex>
          )}
        </Morph>
      </Popover.Content>
    </Popover.Root>
  );
}
