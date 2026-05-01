"use client";

import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  Flex,
  Heading,
  Select,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useEnsureVerified } from "@/lib/verify-action";
import { useT } from "@/lib/i18n";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { CommentSort } from "@repo/shared";

type CommentList = inferRouterOutputs<AppRouter>["comments"]["listByGif"];

interface Props {
  gifId: string;
  initial: CommentList;
}

export function GifCommentsSection({ gifId, initial }: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const session = useSession();
  const ensureVerified = useEnsureVerified();
  const myId = session.data?.user?.id ?? null;

  const [sort, setSort] = useState<CommentSort>("newest");
  const { data } = trpc.comments.listByGif.useQuery(
    { id: gifId, sort },
    { initialData: sort === "newest" ? initial : undefined },
  );
  const create = trpc.comments.createOnGif.useMutation({
    onSuccess: () => utils.comments.listByGif.invalidate({ id: gifId }),
  });

  const [body, setBody] = useState("");

  const items = data ?? [];

  // Top-level only for now; replies on gifs are not exposed here.
  const roots = items.filter((c) => !c.parentId);

  const submit = async () => {
    if (!ensureVerified.ensure("action")) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ gifId, body: trimmed });
      setBody("");
    } catch (err) {
      ensureVerified.handleError(err, "action");
    }
  };

  return (
    <Box>
      <Flex align="center" justify="between" gap="3" mb="3" wrap="wrap">
        <Heading size="4">
          {t(
            items.length === 1 ? "comments.count.one" : "comments.count.many",
            { n: items.length },
          )}
        </Heading>
        <Select.Root
          value={sort}
          onValueChange={(v) => setSort(v as CommentSort)}
        >
          <Select.Trigger aria-label={t("sort.aria.comments")} />
          <Select.Content>
            <Select.Item value="newest">{t("sort.newest")}</Select.Item>
            <Select.Item value="mostLiked">{t("sort.mostLiked")}</Select.Item>
            <Select.Item value="mostDisliked">
              {t("sort.mostDisliked")}
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="2" mb="5">
        <TextArea
          placeholder={t("comments.add.placeholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <Flex justify="end">
          <Button
            onClick={submit}
            disabled={create.isPending || body.trim().length === 0}
          >
            {create.isPending ? t("comments.posting") : t("comments.post")}
          </Button>
        </Flex>
      </Flex>

      <Flex direction="column" gap="4">
        {roots.map((c) => (
          <CommentRow
            key={c.id}
            comment={c}
            mine={myId === c.author.id}
          />
        ))}
      </Flex>
    </Box>
  );
}

function CommentRow({
  comment,
  mine,
}: {
  comment: CommentList[number];
  mine: boolean;
}) {
  void mine;
  const ensureVerified = useEnsureVerified();
  const [likes, setLikes] = useState(comment.likeCount);
  const [dislikes, setDislikes] = useState(comment.dislikeCount);
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(
    comment.viewerReaction,
  );
  const react = trpc.comments.react.useMutation();

  const click = async (next: "like" | "dislike") => {
    if (!ensureVerified.ensure("action")) return;
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
      const res = await react.mutateAsync({
        commentId: comment.id,
        type: next,
      });
      setReaction(res.reaction ?? null);
    } catch (err) {
      setLikes(likes);
      setDislikes(dislikes);
      setReaction(prev);
      ensureVerified.handleError(err, "action");
    }
  };

  return (
    <Flex gap="3" align="start">
      <Avatar
        size="2"
        src={comment.author.avatarUrl ?? undefined}
        fallback={comment.author.name.slice(0, 1).toUpperCase()}
        radius="full"
      />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Flex gap="2" align="center" mb="1" wrap="wrap">
          <Text size="2" weight="medium">{comment.author.name}</Text>
          <Text size="1" color="gray">
            {new Date(comment.createdAt).toLocaleString()}
          </Text>
        </Flex>
        <Text size="2" style={{ whiteSpace: "pre-wrap" }}>
          {comment.body}
        </Text>
        <Flex gap="3" mt="1" align="center">
          <button
            type="button"
            onClick={() => click("like")}
            disabled={react.isPending}
            className="comment-action"
            aria-pressed={reaction === "like"}
            style={{
              color: reaction === "like" ? "var(--iris-11)" : undefined,
            }}
          >
            👍 {likes}
          </button>
          <button
            type="button"
            onClick={() => click("dislike")}
            disabled={react.isPending}
            className="comment-action"
            aria-pressed={reaction === "dislike"}
            style={{
              color: reaction === "dislike" ? "var(--red-11)" : undefined,
            }}
          >
            👎 {dislikes}
          </button>
        </Flex>
      </Box>
    </Flex>
  );
}
