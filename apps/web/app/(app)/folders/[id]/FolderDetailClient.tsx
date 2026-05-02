"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
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
import { Cross2Icon, Pencil1Icon, TrashIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { GifCard } from "@/components/GifCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type ListGifsResult = inferRouterOutputs<AppRouter>["folders"]["listGifs"];

const NAME_MAX = 80;

interface Props {
  folderId: string;
  initialName: string;
  initialGifs: ListGifsResult;
}

export function FolderDetailClient({
  folderId,
  initialName,
  initialGifs,
}: Props) {
  const t = useT();
  const router = useRouter();
  const utils = trpc.useUtils();

  // Subscribe to the folder list so the rename optimistically reflects in
  // the title without requiring a refetch.
  const folders = trpc.folders.list.useQuery(undefined, {
    staleTime: 10_000,
  });
  const liveName =
    folders.data?.find((f) => f.id === folderId)?.name ?? initialName;

  const gifs = trpc.folders.listGifs.useQuery(
    { folderId, limit: 24 },
    {
      initialData: initialGifs,
      staleTime: 10_000,
    },
  );

  const items = gifs.data?.items ?? [];

  const rename = trpc.folders.rename.useMutation();
  const remove = trpc.folders.delete.useMutation();
  const removeGif = trpc.folders.removeGif.useMutation();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(liveName);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Re-seed the rename input each time the dialog opens so it reflects the
  // current name (including any rename done elsewhere this session).
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
          <Heading size="6" style={{ wordBreak: "break-word" }}>
            {liveName}
          </Heading>
          <Flex gap="2" align="center" wrap="wrap">
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
          </Flex>
        </Flex>
      </div>

      {items.length === 0 ? (
        <Box
          style={{
            padding: "64px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
            textAlign: "center",
          }}
        >
          <Heading size="4" mb="2">
            {t("folders.detail.empty.title")}
          </Heading>
          <Text as="p" color="gray" size="2">
            {t("folders.detail.empty.body")}
          </Text>
        </Box>
      ) : (
        <div className="dashboard-grid">
          {items.map((g, i) => (
            <Box key={g.id} style={{ position: "relative" }}>
              <GifCard gif={g} index={i} />
              {/* Overlay sits ABOVE the card's right-edge add-to-folder
                  affordance and short-circuits its click before the
                  navigating <a> sees it. Square red badge keeps the
                  affordance distinct from the bookmark icon. */}
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
            </Box>
          ))}
        </div>
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
    </>
  );
}
