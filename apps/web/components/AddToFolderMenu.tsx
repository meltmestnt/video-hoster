"use client";

import { useState, type ReactNode } from "react";
import { DropdownMenu, IconButton } from "@radix-ui/themes";
import { BookmarkIcon, CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { FolderCreateDialog } from "./FolderCreateDialog";

interface Props {
  gifId: string;
  align?: "start" | "center" | "end";
  children?: ReactNode;
}

export function AddToFolderMenu({ gifId, align = "end", children }: Props) {
  const t = useT();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Skip the queries entirely for signed-out viewers — they never get to
  // the items branch and we don't want to fire 401-bound requests.
  const folders = trpc.folders.list.useQuery(undefined, { enabled: signedIn });
  const memberOf = trpc.folders.folderIdsForGif.useQuery(
    { id: gifId },
    { enabled: signedIn },
  );

  const addGif = trpc.folders.addGif.useMutation();
  const removeGif = trpc.folders.removeGif.useMutation();

  const memberSet = new Set(memberOf.data ?? []);

  const toggle = async (folderId: string) => {
    const wasMember = memberSet.has(folderId);
    try {
      if (wasMember) {
        await removeGif.mutateAsync({ folderId, gifId });
      } else {
        await addGif.mutateAsync({ folderId, gifId });
      }
      await Promise.all([
        utils.folders.folderIdsForGif.invalidate({ id: gifId }),
        utils.folders.list.invalidate(),
        utils.folders.listGifs.invalidate({ folderId }),
      ]);
    } catch {
      // Swallow — the optimistic UI just won't flip; the next list refetch
      // will reconcile if the mutation actually failed.
    }
  };

  const trigger = children ?? (
    <IconButton
      variant="soft"
      color="gray"
      aria-label={t("gifCard.menu.addToFolder")}
      title={t("gifCard.menu.addToFolder")}
    >
      <BookmarkIcon />
    </IconButton>
  );

  if (!signedIn) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Content align={align}>
          <DropdownMenu.Item disabled>
            {t("gifCard.menu.addToFolder.signInRequired")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  }

  const items = folders.data ?? [];

  return (
    <>
      <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenu.Trigger>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Content align={align}>
          {items.length === 0 && (
            <DropdownMenu.Item disabled>
              {t("folders.empty.title")}
            </DropdownMenu.Item>
          )}
          {items.map((f) => {
            const isMember = memberSet.has(f.id);
            return (
              <DropdownMenu.Item
                key={f.id}
                onSelect={(e) => {
                  // Keep the menu open so users can toggle multiple folders
                  // in one go without reopening it each time.
                  e.preventDefault();
                  void toggle(f.id);
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-flex",
                    width: 16,
                    justifyContent: "center",
                    marginRight: 6,
                  }}
                >
                  {isMember ? <CheckIcon /> : null}
                </span>
                {f.name}
              </DropdownMenu.Item>
            );
          })}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              setCreateOpen(true);
            }}
          >
            <PlusIcon style={{ marginRight: 6 }} />
            {t("gifCard.menu.addToFolder.create")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <FolderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (folder) => {
          // Auto-add into the freshly created folder so the action the
          // user took ("+ New folder…") actually files this gif somewhere.
          try {
            await addGif.mutateAsync({ folderId: folder.id, gifId });
            await Promise.all([
              utils.folders.folderIdsForGif.invalidate({ id: gifId }),
              utils.folders.list.invalidate(),
            ]);
          } catch {
            // ignore — folder still exists, user can pick it manually
          }
        }}
      />
    </>
  );
}
