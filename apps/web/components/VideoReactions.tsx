"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Flex } from "@radix-ui/themes";
import { signIn, useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

interface Props {
  videoId: string;
  initialLikes: number;
  initialDislikes: number;
  initialReaction: "like" | "dislike" | null;
}

export function VideoReactions({
  videoId,
  initialLikes,
  initialDislikes,
  initialReaction,
}: Props) {
  const session = useSession();
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(
    initialReaction,
  );
  const react = trpc.videos.react.useMutation();

  const click = async (next: "like" | "dislike") => {
    if (!session.data) {
      signIn();
      return;
    }
    if (react.isPending) return;

    const prev = reaction;
    let optimisticLikes = likes;
    let optimisticDislikes = dislikes;
    let optimisticReaction: "like" | "dislike" | null = next;

    if (prev === next) {
      optimisticReaction = null;
      if (next === "like") optimisticLikes -= 1;
      else optimisticDislikes -= 1;
    } else if (prev) {
      if (next === "like") {
        optimisticLikes += 1;
        optimisticDislikes -= 1;
      } else {
        optimisticDislikes += 1;
        optimisticLikes -= 1;
      }
    } else {
      if (next === "like") optimisticLikes += 1;
      else optimisticDislikes += 1;
    }

    setLikes(optimisticLikes);
    setDislikes(optimisticDislikes);
    setReaction(optimisticReaction);

    try {
      const res = await react.mutateAsync({ videoId, type: next });
      // Server is the source of truth; sync if our optimistic guess drifted.
      setReaction(res.reaction ?? null);
      router.refresh();
    } catch {
      // Roll back optimistic update on failure
      setLikes(likes);
      setDislikes(dislikes);
      setReaction(prev);
    }
  };

  return (
    <Flex gap="2" align="center">
      <Button
        size="2"
        variant={reaction === "like" ? "solid" : "soft"}
        color={reaction === "like" ? "iris" : "gray"}
        onClick={() => click("like")}
        disabled={react.isPending}
        aria-pressed={reaction === "like"}
      >
        👍 {likes}
      </Button>
      <Button
        size="2"
        variant={reaction === "dislike" ? "solid" : "soft"}
        color={reaction === "dislike" ? "red" : "gray"}
        onClick={() => click("dislike")}
        disabled={react.isPending}
        aria-pressed={reaction === "dislike"}
      >
        👎 {dislikes}
      </Button>
    </Flex>
  );
}
