"use client";

import { useMemo, useState } from "react";
import {
  AlertDialog,
  Avatar,
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Select,
  Text,
  TextArea,
} from "@radix-ui/themes";
import { signIn, useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";
import type { CommentSort } from "@repo/shared";

type CommentList = inferRouterOutputs<AppRouter>["comments"]["listByVideo"];
type CommentItem = CommentList[number];

interface Props {
  videoId: string;
  initial: CommentList;
}

interface ThreadedComment extends CommentItem {
  replies: CommentItem[];
}

// Threads roots in the order returned by the server (which already honors the
// chosen sort). Replies are grouped under their parent and stay chronological.
function buildThread(items: CommentItem[]): ThreadedComment[] {
  const byParent = new Map<string, CommentItem[]>();
  for (const c of items) {
    if (!c.parentId) continue;
    const arr = byParent.get(c.parentId) ?? [];
    arr.push(c);
    byParent.set(c.parentId, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }
  return items
    .filter((c) => !c.parentId)
    .map((r) => ({ ...r, replies: byParent.get(r.id) ?? [] }));
}

export function CommentsSection({ videoId, initial }: Props) {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const myId = me.data?.id ?? null;

  const [sort, setSort] = useState<CommentSort>("newest");

  const { data } = trpc.comments.listByVideo.useQuery(
    { id: videoId, sort },
    { initialData: sort === "newest" ? initial : undefined },
  );
  const refresh = () =>
    utils.comments.listByVideo.invalidate({ id: videoId });

  const create = trpc.comments.create.useMutation({ onSuccess: refresh });
  const update = trpc.comments.update.useMutation({ onSuccess: refresh });
  const remove = trpc.comments.delete.useMutation({ onSuccess: refresh });

  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const items = data ?? [];
  const threaded = useMemo(() => buildThread(items), [items]);
  const total = items.length;

  const submitTopLevel = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await create.mutateAsync({ videoId, body: trimmed });
    setBody("");
  };

  return (
    <Box>
      <Flex align="center" justify="between" gap="3" mb="3" wrap="wrap">
        <Heading size="4">
          {total} {total === 1 ? "comment" : "comments"}
        </Heading>
        <Select.Root
          value={sort}
          onValueChange={(v) => setSort(v as CommentSort)}
        >
          <Select.Trigger aria-label="Sort comments" />
          <Select.Content>
            <Select.Item value="newest">Newest</Select.Item>
            <Select.Item value="mostLiked">Most liked</Select.Item>
            <Select.Item value="mostDisliked">Most disliked</Select.Item>
          </Select.Content>
        </Select.Root>
      </Flex>

      <Flex direction="column" gap="2" mb="5">
        <TextArea
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <Flex justify="end">
          <Button
            onClick={submitTopLevel}
            disabled={create.isPending || body.trim().length === 0}
          >
            {create.isPending ? "Posting..." : "Comment"}
          </Button>
        </Flex>
      </Flex>

      <Flex direction="column" gap="4">
        {threaded.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            myId={myId}
            isReplying={replyTo === c.id}
            onStartReply={() => setReplyTo(c.id)}
            onCancelReply={() => setReplyTo(null)}
            onSubmitReply={async (text) => {
              await create.mutateAsync({
                videoId,
                body: text,
                parentId: c.id,
              });
              setReplyTo(null);
            }}
            replyPending={create.isPending}
            editingId={editingId}
            onStartEdit={(id) => setEditingId(id)}
            onCancelEdit={() => setEditingId(null)}
            onSubmitEdit={async (id, text) => {
              await update.mutateAsync({ id, body: text });
              setEditingId(null);
            }}
            editPending={update.isPending}
            onDelete={async (id) => {
              await remove.mutateAsync({ id });
            }}
            deletePending={remove.isPending}
          />
        ))}
      </Flex>
    </Box>
  );
}

interface NodeProps {
  comment: ThreadedComment;
  myId: string | null;
  isReplying: boolean;
  onStartReply: () => void;
  onCancelReply: () => void;
  onSubmitReply: (text: string) => Promise<void>;
  replyPending: boolean;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: (id: string, text: string) => Promise<void>;
  editPending: boolean;
  onDelete: (id: string) => Promise<void>;
  deletePending: boolean;
}

function CommentNode({
  comment: c,
  myId,
  isReplying,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  replyPending,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editPending,
  onDelete,
  deletePending,
}: NodeProps) {
  return (
    <Box>
      <CommentRow
        comment={c}
        myId={myId}
        isEditing={editingId === c.id}
        onStartEdit={() => onStartEdit(c.id)}
        onCancelEdit={onCancelEdit}
        onSubmitEdit={(text) => onSubmitEdit(c.id, text)}
        editPending={editPending}
        onDelete={() => onDelete(c.id)}
        deletePending={deletePending}
        onStartReply={onStartReply}
        canReply
      />

      {isReplying && (
        <Box style={{ marginLeft: 44, marginTop: 8 }}>
          <ReplyForm
            onSubmit={onSubmitReply}
            onCancel={onCancelReply}
            pending={replyPending}
            placeholder={`Reply to ${c.author.name}...`}
          />
        </Box>
      )}

      {c.replies.length > 0 && (
        <Flex
          direction="column"
          gap="3"
          style={{ marginLeft: 44, marginTop: 12 }}
        >
          {c.replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              myId={myId}
              isEditing={editingId === r.id}
              onStartEdit={() => onStartEdit(r.id)}
              onCancelEdit={onCancelEdit}
              onSubmitEdit={(text) => onSubmitEdit(r.id, text)}
              editPending={editPending}
              onDelete={() => onDelete(r.id)}
              deletePending={deletePending}
              canReply={false}
            />
          ))}
        </Flex>
      )}
    </Box>
  );
}

interface RowProps {
  comment: CommentItem;
  myId: string | null;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (text: string) => Promise<void>;
  editPending: boolean;
  onDelete: () => Promise<void>;
  deletePending: boolean;
  onStartReply?: () => void;
  canReply: boolean;
}

function CommentRow({
  comment: c,
  myId,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  editPending,
  onDelete,
  deletePending,
  onStartReply,
  canReply,
}: RowProps) {
  const mine = !!myId && c.author.id === myId;
  const edited =
    new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (err) {
      setDeleteError((err as Error).message ?? "Delete failed");
    }
  };

  return (
    <Flex gap="3" align="start">
      <Avatar
        size="2"
        src={c.author.avatarUrl ?? undefined}
        fallback={c.author.name.slice(0, 1).toUpperCase()}
        radius="full"
      />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Flex gap="2" align="center" mb="1" wrap="wrap">
          <Text size="2" weight="medium">
            {c.author.name}
          </Text>
          <Text size="1" color="gray">
            {new Date(c.createdAt).toLocaleString()}
          </Text>
          {edited && (
            <Text size="1" color="gray">
              (edited)
            </Text>
          )}
        </Flex>

        {isEditing ? (
          <EditForm
            initial={c.body}
            pending={editPending}
            onCancel={onCancelEdit}
            onSubmit={onSubmitEdit}
          />
        ) : (
          <Text size="2" style={{ whiteSpace: "pre-wrap" }}>
            {c.body}
          </Text>
        )}

        {!isEditing && (
          <Flex gap="3" mt="1" align="center">
            <CommentReactionButtons
              commentId={c.id}
              initialLikes={c.likeCount}
              initialDislikes={c.dislikeCount}
              initialReaction={c.viewerReaction}
            />
            {canReply && myId && !mine && onStartReply && (
              <button
                type="button"
                onClick={onStartReply}
                className="comment-action"
              >
                Reply
              </button>
            )}
            {mine && (
              <>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="comment-action"
                >
                  Edit
                </button>
                <AlertDialog.Root
                  open={deleteOpen}
                  onOpenChange={(o) => {
                    setDeleteOpen(o);
                    if (!o) setDeleteError(null);
                  }}
                >
                  <AlertDialog.Trigger>
                    <button
                      type="button"
                      disabled={deletePending}
                      className="comment-action comment-action-danger"
                    >
                      Delete
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="440px">
                    <AlertDialog.Title>Delete comment?</AlertDialog.Title>
                    <AlertDialog.Description size="2">
                      This comment will be permanently removed
                      {c.parentId ? "" : ", along with any replies"}. This
                      cannot be undone.
                    </AlertDialog.Description>

                    {deleteError && (
                      <Callout.Root color="red" mt="3">
                        <Callout.Text>{deleteError}</Callout.Text>
                      </Callout.Root>
                    )}

                    <Flex gap="3" mt="4" justify="end">
                      <AlertDialog.Cancel>
                        <Button
                          variant="soft"
                          color="gray"
                          disabled={deletePending}
                        >
                          Cancel
                        </Button>
                      </AlertDialog.Cancel>
                      <Button
                        color="red"
                        onClick={confirmDelete}
                        disabled={deletePending}
                      >
                        {deletePending ? "Deleting..." : "Delete"}
                      </Button>
                    </Flex>
                  </AlertDialog.Content>
                </AlertDialog.Root>
              </>
            )}
          </Flex>
        )}
      </Box>
    </Flex>
  );
}

function ReplyForm({
  onSubmit,
  onCancel,
  pending,
  placeholder,
}: {
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await onSubmit(t);
    setText("");
  };
  return (
    <Flex direction="column" gap="2">
      <TextArea
        autoFocus
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
      />
      <Flex gap="2" justify="end">
        <Button
          variant="soft"
          color="gray"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !text.trim()}>
          {pending ? "Posting..." : "Reply"}
        </Button>
      </Flex>
    </Flex>
  );
}

function EditForm({
  initial,
  onSubmit,
  onCancel,
  pending,
}: {
  initial: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel: () => void;
  pending: boolean;
}) {
  const [text, setText] = useState(initial);
  const submit = async () => {
    const t = text.trim();
    if (!t || t === initial) {
      onCancel();
      return;
    }
    await onSubmit(t);
  };
  return (
    <Flex direction="column" gap="2">
      <TextArea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
      />
      <Flex gap="2" justify="end">
        <Button
          variant="soft"
          color="gray"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !text.trim()}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </Flex>
    </Flex>
  );
}

function CommentReactionButtons({
  commentId,
  initialLikes,
  initialDislikes,
  initialReaction,
}: {
  commentId: string;
  initialLikes: number;
  initialDislikes: number;
  initialReaction: "like" | "dislike" | null;
}) {
  const session = useSession();
  const [likes, setLikes] = useState(initialLikes);
  const [dislikes, setDislikes] = useState(initialDislikes);
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(
    initialReaction,
  );
  const react = trpc.comments.react.useMutation();

  const click = async (next: "like" | "dislike") => {
    if (!session.data) {
      signIn();
      return;
    }
    if (react.isPending) return;

    const prev = reaction;
    let optLikes = likes;
    let optDislikes = dislikes;
    let optReaction: "like" | "dislike" | null = next;

    if (prev === next) {
      optReaction = null;
      if (next === "like") optLikes -= 1;
      else optDislikes -= 1;
    } else if (prev) {
      if (next === "like") {
        optLikes += 1;
        optDislikes -= 1;
      } else {
        optDislikes += 1;
        optLikes -= 1;
      }
    } else {
      if (next === "like") optLikes += 1;
      else optDislikes += 1;
    }

    setLikes(optLikes);
    setDislikes(optDislikes);
    setReaction(optReaction);

    try {
      const res = await react.mutateAsync({ commentId, type: next });
      setReaction(res.reaction ?? null);
    } catch {
      setLikes(likes);
      setDislikes(dislikes);
      setReaction(prev);
    }
  };

  return (
    <Flex gap="2" align="center">
      <button
        type="button"
        onClick={() => click("like")}
        disabled={react.isPending}
        className="comment-action"
        aria-pressed={reaction === "like"}
        style={{ color: reaction === "like" ? "var(--iris-11)" : undefined }}
      >
        👍 {likes}
      </button>
      <button
        type="button"
        onClick={() => click("dislike")}
        disabled={react.isPending}
        className="comment-action"
        aria-pressed={reaction === "dislike"}
        style={{ color: reaction === "dislike" ? "var(--red-11)" : undefined }}
      >
        👎 {dislikes}
      </button>
    </Flex>
  );
}
