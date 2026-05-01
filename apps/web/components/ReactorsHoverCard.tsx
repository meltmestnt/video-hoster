"use client";

import { useState, type ReactNode } from "react";
import { Avatar, Box, Flex, HoverCard, Text } from "@radix-ui/themes";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

type Kind = "video" | "gif";
type ReactionType = "like" | "dislike";

interface Props {
  kind: Kind;
  /** Video id or gif id, depending on `kind`. */
  targetId: string;
  type: ReactionType;
  /** Total reactions of this type. We only fetch the list when total > 0
   *  AND the user actually hovers, so a 0-count card stays compact. */
  count: number;
  children: ReactNode;
}

const FETCH_LIMIT = 12;

/**
 * Reusable hover card for the like / dislike buttons. Wraps a trigger and
 * lazy-loads the list of reactors the first time the user hovers.
 *
 * Public: works for anonymous viewers too — no auth required to see who
 * liked something. The list is capped at 12; everything past that shows
 * up as "+N more" using the server-reported total so the count never
 * disagrees with the button label.
 */
export function ReactorsHoverCard({
  kind,
  targetId,
  type,
  count,
  children,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Bind the right query lazily — both endpoints take the same shape
  // modulo the id field name. Hooks have to be called unconditionally,
  // so we always call both and only the relevant one is enabled.
  const videoQuery = trpc.videos.reactors.useQuery(
    { videoId: targetId, type, limit: FETCH_LIMIT },
    {
      enabled: open && kind === "video" && count > 0,
      staleTime: 30_000,
    },
  );
  const gifQuery = trpc.gifs.reactors.useQuery(
    { gifId: targetId, type, limit: FETCH_LIMIT },
    {
      enabled: open && kind === "gif" && count > 0,
      staleTime: 30_000,
    },
  );
  const data = kind === "video" ? videoQuery.data : gifQuery.data;
  const isLoading =
    kind === "video" ? videoQuery.isLoading : gifQuery.isLoading;

  // Don't render the card at all when there's nothing to show — saves
  // a hover-card portal mount per visible button. Just render the
  // trigger and bail.
  if (count === 0) {
    return <>{children}</>;
  }

  const headingKey = type === "like" ? "reactors.likedBy" : "reactors.dislikedBy";
  const emptyKey =
    type === "like" ? "reactors.empty.like" : "reactors.empty.dislike";

  return (
    <HoverCard.Root
      openDelay={120}
      closeDelay={80}
      onOpenChange={setOpen}
    >
      <HoverCard.Trigger>
        <span style={{ display: "inline-flex" }}>{children}</span>
      </HoverCard.Trigger>
      <HoverCard.Content size="2" style={{ minWidth: 220, maxWidth: 280 }}>
        <Box>
          <Text size="2" weight="medium">
            {t(headingKey)}
          </Text>
          {isLoading && !data && (
            <Text as="div" size="2" color="gray" mt="2">
              {t("reactors.loading")}
            </Text>
          )}
          {data && data.items.length === 0 && (
            <Text as="div" size="2" color="gray" mt="2">
              {t(emptyKey)}
            </Text>
          )}
          {data && data.items.length > 0 && (
            <Flex direction="column" gap="2" mt="2">
              {data.items.map((u) => (
                <ReactorRow key={u.id} user={u} />
              ))}
              {data.total > data.items.length && (
                <Text size="1" color="gray" mt="1">
                  {t("reactors.more", {
                    n: data.total - data.items.length,
                  })}
                </Text>
              )}
            </Flex>
          )}
        </Box>
      </HoverCard.Content>
    </HoverCard.Root>
  );
}

function ReactorRow({
  user,
}: {
  user: {
    id: string;
    name: string;
    username: string | null;
    avatarUrl: string | null;
  };
}) {
  const inner = (
    <Flex align="center" gap="2" style={{ minWidth: 0 }}>
      <Avatar
        size="1"
        src={user.avatarUrl ?? undefined}
        fallback={user.name.slice(0, 1).toUpperCase()}
        radius="full"
      />
      <Text
        size="2"
        truncate
        // The card itself is in a tooltip-like portal; the link inherits
        // gray-12 to stay legible against the surface bg.
        style={{ color: "var(--gray-12)" }}
      >
        {user.name}
      </Text>
    </Flex>
  );
  if (!user.username) return inner;
  return (
    <Link
      href={`/@${user.username}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      {inner}
    </Link>
  );
}
