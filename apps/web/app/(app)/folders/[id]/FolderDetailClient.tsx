"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  Cross2Icon,
  MagnifyingGlassIcon,
  Pencil1Icon,
  Share1Icon,
  StackIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { GifCard } from "@/components/GifCard";
import { InfiniteScrollSpinner } from "@/components/InfiniteScrollSentinel";
import { FolderShareDialog } from "@/components/FolderShareDialog";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type ListGifsResult = inferRouterOutputs<AppRouter>["folders"]["listGifs"];

const NAME_MAX = 80;
const SEARCH_DEBOUNCE_MS = 200;
const TAGS_CHIP_LIMIT = 16;
const SIMILAR_LIMIT = 24;

interface Props {
  folderId: string;
  initialName: string;
  initialGifs: ListGifsResult;
  isOwner: boolean;
  ownerName?: string | null;
}

export function FolderDetailClient({
  folderId,
  initialName,
  initialGifs,
  isOwner,
  ownerName,
}: Props) {
  const t = useT();
  const router = useRouter();
  const utils = trpc.useUtils();

  const folders = trpc.folders.list.useQuery(undefined, {
    enabled: isOwner,
    staleTime: 10_000,
  });
  const sharedFolders = trpc.folders.listSharedWithMe.useQuery(undefined, {
    enabled: !isOwner,
    staleTime: 10_000,
  });

  const liveName = isOwner
    ? folders.data?.find((f) => f.id === folderId)?.name ?? initialName
    : sharedFolders.data?.find((f) => f.id === folderId)?.name ?? initialName;

  // Search + tag-chip + similar-mode state. The grid below derives its
  // items from one of three sources depending on which mode is active:
  //   - similarSource is set → folders.suggested results
  //   - debouncedQ or activeTag is set → folders.listGifs with filters
  //   - neither → unfiltered folders.listGifs (initial data wins)
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [similarSource, setSimilarSource] = useState<
    { id: string; title: string } | null
  >(null);

  useEffect(() => {
    const id = window.setTimeout(
      () => setDebouncedQ(q.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [q]);

  // Hide initial data once the user starts filtering — otherwise the
  // initial unfiltered page would briefly flash through during a
  // refetch with new params. The unfiltered fetch keeps initialData so
  // the first paint matches SSR.
  const filtering =
    debouncedQ.length > 0 || activeTag !== null || similarSource !== null;

  const gifs = trpc.folders.listGifs.useQuery(
    {
      folderId,
      limit: 24,
      q: debouncedQ || null,
      tag: activeTag,
    },
    {
      initialData: filtering ? undefined : initialGifs,
      staleTime: 10_000,
      enabled: similarSource === null,
    },
  );

  const tagChips = trpc.folders.listFolderTags.useQuery(
    { folderId, limit: TAGS_CHIP_LIMIT },
    { staleTime: 30_000 },
  );

  const similar = trpc.folders.suggested.useQuery(
    similarSource
      ? { folderId, gifId: similarSource.id, limit: SIMILAR_LIMIT }
      : { folderId, gifId: "", limit: SIMILAR_LIMIT },
    {
      enabled: similarSource !== null,
      staleTime: 30_000,
    },
  );

  const items = useMemo(() => {
    if (similarSource) return similar.data ?? [];
    return gifs.data?.items ?? [];
  }, [similarSource, similar.data, gifs.data?.items]);

  const isLoadingItems = similarSource ? similar.isFetching : gifs.isFetching;

  const rename = trpc.folders.rename.useMutation();
  const remove = trpc.folders.delete.useMutation();
  const removeGif = trpc.folders.removeGif.useMutation();
  const leaveShare = trpc.folders.leaveShare.useMutation();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(liveName);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (renameOpen) {
      setRenameValue(liveName);
      setRenameError(null);
    }
  }, [renameOpen, liveName]);

  const submitRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed.length === 0) {
      setRenameError(t("folders.error.nameRequired"));
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setRenameError(t("folders.error.nameTooLong"));
      return;
    }
    if (trimmed === liveName) {
      setRenameOpen(false);
      return;
    }
    setRenameError(null);
    try {
      await rename.mutateAsync({ folderId, name: trimmed });
      await utils.folders.list.invalidate();
      setRenameOpen(false);
    } catch (err) {
      setRenameError((err as Error).message);
    }
  };

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const submitDelete = async () => {
    setDeleteError(null);
    try {
      await remove.mutateAsync({ folderId });
      await utils.folders.list.invalidate();
      router.push("/folders");
      router.refresh();
    } catch (err) {
      setDeleteError((err as Error).message);
    }
  };

  const [shareOpen, setShareOpen] = useState(false);

  const [leaveOpen, setLeaveOpen] = useState(false);
  const submitLeave = async () => {
    try {
      await leaveShare.mutateAsync({ folderId });
      await utils.folders.listSharedWithMe.invalidate();
      router.push("/folders/shared");
      router.refresh();
    } catch {
      setLeaveOpen(false);
    }
  };

  const handleRemoveGif = async (gifId: string) => {
    try {
      await removeGif.mutateAsync({ folderId, gifId });
      await Promise.all([
        utils.folders.listGifs.invalidate({ folderId }),
        utils.folders.list.invalidate(),
        utils.folders.folderIdsForGif.invalidate({ id: gifId }),
      ]);
    } catch {
      // Surface nothing — list refetch will resync on next mount.
    }
  };

  return (
    <>
      <div className="page-header">
        <Flex justify="between" align="center" gap="3" wrap="wrap" mb="4">
          <Box style={{ minWidth: 0 }}>
            <Heading size="6" style={{ wordBreak: "break-word" }}>
              {liveName}
            </Heading>
            {!isOwner && ownerName && (
              <Text as="div" size="2" color="gray" mt="1">
                {t("folderDetail.sharedBanner", { name: ownerName })}
              </Text>
            )}
          </Box>
          <Flex gap="2" align="center" wrap="wrap">
            {isOwner ? (
              <>
                <Button
                  variant="soft"
                  onClick={() => setShareOpen(true)}
                >
                  <Share1Icon /> {t("folderDetail.shareButton")}
                </Button>
                <Button
                  variant="soft"
                  color="gray"
                  onClick={() => setRenameOpen(true)}
                >
                  <Pencil1Icon /> {t("folders.detail.rename")}
                </Button>
                <Button
                  variant="soft"
                  color="red"
                  onClick={() => setDeleteOpen(true)}
                >
                  <TrashIcon /> {t("folders.detail.delete")}
                </Button>
              </>
            ) : (
              <Button
                variant="soft"
                color="gray"
                onClick={() => setLeaveOpen(true)}
              >
                {t("sharedFolders.leave")}
              </Button>
            )}
          </Flex>
        </Flex>
      </div>

      {/* Toolbar: search + tag chips. Hidden in similar mode — the
          banner takes over and the chips/search would only confuse the
          UX (a query inside a similar-set is rarely what the user wants). */}
      {similarSource === null && (
        <Flex direction="column" gap="3" mb="4">
          <TextField.Root
            placeholder={t("folders.detail.search.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
            {q && (
              <TextField.Slot>
                <IconButton
                  size="1"
                  variant="ghost"
                  aria-label={t("folders.detail.search.clear")}
                  onClick={() => setQ("")}
                >
                  <Cross2Icon />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>
          {tagChips.data && tagChips.data.length > 0 && (
            <Flex gap="2" wrap="wrap" align="center">
              <Text size="1" color="gray" mr="1">
                {t("folders.detail.tags.label")}:
              </Text>
              <Badge
                asChild
                variant={activeTag === null ? "solid" : "soft"}
                color="iris"
                style={{ cursor: "pointer" }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "inherit",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {t("folders.detail.tags.all")}
                </button>
              </Badge>
              {tagChips.data.map((tag) => (
                <Badge
                  key={tag.name}
                  asChild
                  variant={activeTag === tag.name ? "solid" : "soft"}
                  color="iris"
                  style={{ cursor: "pointer" }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTag(activeTag === tag.name ? null : tag.name)
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: "inherit",
                      font: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    {tag.name} · {tag.count}
                  </button>
                </Badge>
              ))}
            </Flex>
          )}
        </Flex>
      )}

      {/* Similar-mode banner. Shows the source gif's title and a one-tap
          escape hatch back to the full folder. */}
      {similarSource && (
        <Callout.Root color="iris" mb="4">
          <Callout.Icon>
            <StackIcon />
          </Callout.Icon>
          <Flex
            justify="between"
            align="center"
            gap="3"
            wrap="wrap"
            style={{ width: "100%" }}
          >
            <Callout.Text>
              {t("folders.detail.similar.title", { title: similarSource.title })}
            </Callout.Text>
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => setSimilarSource(null)}
            >
              {t("folders.detail.similar.exit")}
            </Button>
          </Flex>
        </Callout.Root>
      )}

      {items.length === 0 && isLoadingItems ? (
        // While a search/tag/similar fetch is in flight with no cached
        // items yet, show a spinner instead of the empty state so the
        // user doesn't read a stale "no matches" before the request
        // even returns. Same dashed-border container as the empty
        // state so layout doesn't jump when it resolves.
        <Box
          style={{
            padding: "64px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <InfiniteScrollSpinner />
        </Box>
      ) : items.length === 0 ? (
        <Box
          style={{
            padding: "64px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
            textAlign: "center",
          }}
        >
          {/* Empty-state copy reflects which mode produced the empty
              set — saves the user from wondering why their populated
              folder looks empty. */}
          {similarSource ? (
            <>
              <Heading size="4" mb="2">
                {t("folders.detail.similar.title", {
                  title: similarSource.title,
                })}
              </Heading>
              <Text as="p" color="gray" size="2">
                {t("folders.detail.similar.empty")}
              </Text>
            </>
          ) : filtering ? (
            <>
              <Heading size="4" mb="2">
                {t("folders.detail.search.empty")}
              </Heading>
              {!isLoadingItems && (
                <Button
                  variant="soft"
                  color="gray"
                  mt="3"
                  onClick={() => {
                    setQ("");
                    setActiveTag(null);
                  }}
                >
                  {t("folders.detail.search.clear")}
                </Button>
              )}
            </>
          ) : (
            <>
              <Heading size="4" mb="2">
                {t("folders.detail.empty.title")}
              </Heading>
              <Text as="p" color="gray" size="2">
                {t("folders.detail.empty.body")}
              </Text>
            </>
          )}
        </Box>
      ) : (
        <div className="dashboard-grid">
          {items.map((g, i) => (
            <Box key={g.id} style={{ position: "relative" }}>
              <GifCard gif={g} index={i} />
              {/* Per-card "find similar" button — visible to anyone with
                  read access (suggested respects folder access on the
                  server). Sits to the LEFT of the remove button when both
                  are present so neither covers the other. */}
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 8,
                  right: isOwner ? 76 : 44,
                  zIndex: 3,
                }}
              >
                <IconButton
                  size="1"
                  variant="solid"
                  color="iris"
                  highContrast
                  aria-label={t("folders.detail.similar.button")}
                  title={t("folders.detail.similar.button")}
                  style={{ opacity: 0.92 }}
                  onClick={() => {
                    setSimilarSource({ id: g.id, title: g.title });
                  }}
                >
                  <StackIcon />
                </IconButton>
              </div>
              {isOwner && (
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 44,
                    zIndex: 3,
                  }}
                >
                  <IconButton
                    size="1"
                    variant="solid"
                    color="red"
                    highContrast
                    aria-label={t("folders.detail.removeGif")}
                    title={t("folders.detail.removeGif")}
                    style={{ opacity: 0.92 }}
                    onClick={() => {
                      void handleRemoveGif(g.id);
                    }}
                  >
                    <Cross2Icon />
                  </IconButton>
                </div>
              )}
            </Box>
          ))}
        </div>
      )}

      {isOwner && (
        <FolderShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          folderId={folderId}
          folderName={liveName}
        />
      )}

      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>{t("folders.detail.rename.dialog.title")}</Dialog.Title>
          <Flex direction="column" gap="3" mt="3">
            <TextField.Root
              autoFocus
              value={renameValue}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setRenameValue(e.target.value);
                if (renameError) setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !rename.isPending) {
                  e.preventDefault();
                  void submitRename();
                }
              }}
            />
            {renameError && (
              <Callout.Root color="red">
                <Callout.Text>{renameError}</Callout.Text>
              </Callout.Root>
            )}
          </Flex>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button
                variant="soft"
                color="gray"
                disabled={rename.isPending}
              >
                {t("common.cancel")}
              </Button>
            </Dialog.Close>
            <Button onClick={submitRename} disabled={rename.isPending}>
              {t("folders.detail.rename.dialog.submit")}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>
            {t("folders.detail.delete.confirm.title")}
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            {t("folders.detail.delete.confirm.body")}
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
                disabled={remove.isPending}
              >
                {t("common.cancel")}
              </Button>
            </AlertDialog.Cancel>
            <Button
              color="red"
              onClick={submitDelete}
              disabled={remove.isPending}
            >
              {t("folders.detail.delete.confirm.submit")}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>{t("sharedFolders.leave")}</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {ownerName
              ? t("folderDetail.sharedBanner", { name: ownerName })
              : null}
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button
                variant="soft"
                color="gray"
                disabled={leaveShare.isPending}
              >
                {t("common.cancel")}
              </Button>
            </AlertDialog.Cancel>
            <Button
              color="red"
              onClick={submitLeave}
              disabled={leaveShare.isPending}
            >
              {t("sharedFolders.leave")}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
