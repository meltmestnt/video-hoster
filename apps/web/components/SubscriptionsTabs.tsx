"use client";

import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Flex,
  Tabs,
  Text,
} from "@radix-ui/themes";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import { trpc } from "@/lib/trpc";
import { SubscribeButton } from "./SubscribeButton";

type FollowingPage = inferRouterOutputs<AppRouter>["subscriptions"]["following"];
type FollowersPage = inferRouterOutputs<AppRouter>["subscriptions"]["followers"];

interface Props {
  initialFollowing: FollowingPage;
  initialFollowers: FollowersPage;
}

export function SubscriptionsTabs({
  initialFollowing,
  initialFollowers,
}: Props) {
  const [tab, setTab] = useState<"following" | "followers">("following");

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <Tabs.List>
        <Tabs.Trigger value="following">Following</Tabs.Trigger>
        <Tabs.Trigger value="followers">Followers</Tabs.Trigger>
      </Tabs.List>
      <Box pt="4">
        <Tabs.Content value="following">
          <FollowingList initial={initialFollowing} />
        </Tabs.Content>
        <Tabs.Content value="followers">
          <FollowersList initial={initialFollowers} />
        </Tabs.Content>
      </Box>
    </Tabs.Root>
  );
}

function FollowingList({ initial }: { initial: FollowingPage }) {
  const query = trpc.subscriptions.following.useInfiniteQuery(
    { limit: 24 },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialData: { pages: [initial], pageParams: [undefined] },
      initialCursor: undefined,
    },
  );
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <Text size="2" color="gray">
        You're not following anyone yet. Open a video and hit Subscribe to
        start.
      </Text>
    );
  }
  return (
    <UserList
      items={items}
      hasNextPage={!!query.hasNextPage}
      loadMore={() => query.fetchNextPage()}
      loading={query.isFetchingNextPage}
      showSubscribeButton
    />
  );
}

function FollowersList({ initial }: { initial: FollowersPage }) {
  const query = trpc.subscriptions.followers.useInfiniteQuery(
    { limit: 24 },
    {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialData: { pages: [initial], pageParams: [undefined] },
      initialCursor: undefined,
    },
  );
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <Text size="2" color="gray">
        No followers yet. When someone subscribes to you they'll show up here.
      </Text>
    );
  }
  return (
    <UserList
      items={items}
      hasNextPage={!!query.hasNextPage}
      loadMore={() => query.fetchNextPage()}
      loading={query.isFetchingNextPage}
      showSubscribeButton
    />
  );
}

interface UserRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  subscribedAt: Date | string;
}

function UserList({
  items,
  hasNextPage,
  loadMore,
  loading,
  showSubscribeButton,
}: {
  items: UserRow[];
  hasNextPage: boolean;
  loadMore: () => void;
  loading: boolean;
  showSubscribeButton: boolean;
}) {
  return (
    <Flex direction="column" gap="2">
      {items.map((u) => (
        <Flex
          key={u.id}
          align="center"
          gap="3"
          p="3"
          style={{
            border: "1px solid var(--gray-4)",
            borderRadius: "var(--radius-3)",
          }}
        >
          <Avatar
            size="3"
            radius="full"
            src={u.avatarUrl ?? undefined}
            fallback={(u.name || "?").slice(0, 1).toUpperCase()}
          />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text as="div" size="3" weight="medium">
              {u.name}
            </Text>
            <Text as="div" size="1" color="gray">
              Subscribed {new Date(u.subscribedAt).toLocaleDateString()}
            </Text>
          </Box>
          {showSubscribeButton && (
            <SubscribeButton targetUserId={u.id} hideForSelf />
          )}
        </Flex>
      ))}
      {hasNextPage && (
        <Flex justify="center" mt="2">
          <Button
            variant="soft"
            color="gray"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </Flex>
      )}
    </Flex>
  );
}
