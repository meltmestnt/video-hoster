"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Flex } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useEnsureVerified } from "@/lib/verify-action";

interface Props {
  gifId: string;
  initialLikes: number;
  initialDislikes: number;
  initialReaction: "like" | "dislike" | null;
}

export function GifReactions({
  gifId,
  initialLikes,
  initialDislikes,
  initialReaction,
}: Props) {
  const router = useRouter();
  const ensureVerified = useEnsureVerified();
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(
    initialReaction,
  );
  const react = trpc.gifs.react.useMutation();

  const click = async (next: "like" | "dislike") => {
    if (!ensureVerified.ensure("action")) return;
    if (react.isPending) return;

    const prev = reaction;
    let oLikes = likes;
    let oDislikes = dislikes;
    let oReaction: "like" | "dislike" | null = next;
    if (prev === next) {
      oReaction = null;
      if (next === "like") oLikes -= 1;
      else oDislikes -= 1;
    } else if (prev) {
      if (next === "like") {
        oLikes += 1;
        oDislikes -= 1;
      } else {
        oDislikes += 1;
        oLikes -= 1;
      }
    } else {
      if (next === "like") oLikes += 1;
      else oDislikes += 1;
    }
    setLikes(oLikes);
    setDislikes(oDislikes);
    setReaction(oReaction);
    try {
      const res = await react.mutateAsync({ gifId, type: next });
      setReaction(res.reaction ?? null);
      router.refresh();
    } catch (err) {
      setLikes(likes);
      setDislikes(dislikes);
      setReaction(prev);
      ensureVerified.handleError(err, "action");
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
