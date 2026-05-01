"use client";

import { useEffect, useState } from "react";
import { Flex, Text } from "@radix-ui/themes";
import { EyeOpenIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

type Kind = "video" | "gif" | "screenshot";

interface Props {
  kind: Kind;
  id: string;
  /** Server-rendered initial count so the badge isn't blank on first paint. */
  initialCount: number;
}

const SESSION_KEY_PREFIX = "vng:viewed:";

/**
 * Renders the view count and, on mount, fires a +1 mutation — but only
 * once per (kind, id) per browser session. The session-storage flag stops
 * a single user reload spamming counts; cross-session dedupe lives on
 * the API rate limiter.
 *
 * Best-effort: if the mutation fails (network drop, rate limit) we leave
 * the displayed count where the server left it. The next page load will
 * try again.
 */
export function ViewCounter({ kind, id, initialCount }: Props) {
  const t = useT();
  const [count, setCount] = useState(initialCount);

  // Each kind has its own incrementView mutation; pick the right one.
  const videoInc = trpc.videos.incrementView.useMutation();
  const gifInc = trpc.gifs.incrementView.useMutation();
  const screenshotInc = trpc.screenshots.incrementView.useMutation();

  useEffect(() => {
    const key = `${SESSION_KEY_PREFIX}${kind}:${id}`;
    let alreadyViewed = false;
    try {
      alreadyViewed = sessionStorage.getItem(key) === "1";
    } catch {
      // Private mode without sessionStorage — fall through and increment.
    }
    if (alreadyViewed) return;

    // Set the flag *before* the network call so a fast reload-loop can't
    // race past it; even if the mutation fails, we still won't keep
    // hammering it within the same session.
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }

    const fire = async () => {
      try {
        if (kind === "video") {
          const r = await videoInc.mutateAsync({ id });
          setCount(r.viewCount);
        } else if (kind === "gif") {
          const r = await gifInc.mutateAsync({ id });
          setCount(r.viewCount);
        } else {
          const r = await screenshotInc.mutateAsync({ id });
          setCount(r.viewCount);
        }
      } catch {
        // Best-effort — leave count as-is.
      }
    };
    void fire();
    // We intentionally only depend on (kind, id) — re-firing the mutation
    // when its hook identity changes would defeat the dedupe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  return (
    <Flex align="center" gap="1">
      <EyeOpenIcon width="14" height="14" />
      <Text size="2" color="gray">
        {count === 1 ? t("views.one") : t("views.count", { n: count })}
      </Text>
    </Flex>
  );
}
