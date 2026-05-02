"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Flex,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type AdminListFoldersResult =
  inferRouterOutputs<AppRouter>["admin"]["listFolders"];
type FolderRow = AdminListFoldersResult["items"][number];

interface Props {
  initial: AdminListFoldersResult;
}

export function AdminFoldersClient({ initial }: Props) {
  const t = useT();
  const utils = trpc.useUtils();

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  // Debounce the keystrokes so each character doesn't fire a separate query.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(qInput.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [qInput]);

  const list = trpc.admin.listFolders.useInfiniteQuery(
    { limit: 30, q: q || undefined },
    {
      initialData: q
        ? undefined
        : { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items: FolderRow[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const remove = trpc.admin.deleteFolder.useMutation({
    onSuccess: () => {
      void utils.admin.listFolders.invalidate();
    },
  });

  return (
    <Flex direction="column" gap="3">
      <Box style={{ maxWidth: 360 }}>
        <TextField.Root
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder={t("adminFolders.searchPlaceholder")}
        />
      </Box>

      {items.length === 0 ? (
        <Flex
          align="center"
          justify="center"
          style={{
            padding: "48px 24px",
            background: "var(--gray-2)",
            borderRadius: "var(--radius-3)",
            border: "1px dashed var(--gray-5)",
          }}
        >
          <Text color="gray">{t("adminFolders.empty")}</Text>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                {t("adminFolders.column.folder")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("adminFolders.column.owner")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("adminFolders.column.gifs")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("adminFolders.column.shares")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("adminFolders.column.created")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.actions")}
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((row) => (
              <FolderRowView
                key={row.id}
                row={row}
                onDelete={() => remove.mutateAsync({ folderId: row.id })}
                actionPending={remove.isPending}
              />
            ))}
          </Table.Body>
        </Table.Root>
      )}

      {list.hasNextPage && (
        <Flex justify="center" mt="2">
          <Button
            variant="soft"
            color="gray"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {t("adminFolders.loadMore")}
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

function FolderRowView({
  row,
  onDelete,
  actionPending,
}: {
  row: FolderRow;
  onDelete: () => Promise<unknown>;
  actionPending: boolean;
}) {
  const t = useT();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDelete = async () => {
    setError(null);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Table.Row>
      <Table.Cell>
        <Text size="2" weight="medium" style={{ wordBreak: "break-word" }}>
          {row.name}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Flex direction="column">
          <Text size="2" weight="medium">
            {row.owner.name}
          </Text>
          <Text size="1" color="gray">
            {row.owner.email}
          </Text>
        </Flex>
      </Table.Cell>
      <Table.Cell>
        <Text size="2">{row.gifCount}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text size="2">{row.shareCount}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray">
          {new Date(row.createdAt).toLocaleDateString()}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Flex gap="2" wrap="nowrap">
          <Button asChild size="1" variant="soft" color="iris">
            <Link href={`/admin/folders/${row.id}`}>
              {t("adminFolders.actions.browse")}
            </Link>
          </Button>
          <AlertDialog.Root
            open={deleteOpen}
            onOpenChange={(o) => {
              setDeleteOpen(o);
              if (!o) setError(null);
            }}
          >
            <AlertDialog.Trigger>
              <Button
                size="1"
                variant="soft"
                color="red"
                disabled={actionPending}
              >
                {t("adminFolders.actions.delete")}
              </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content maxWidth="440px">
              <AlertDialog.Title>
                {t("adminFolders.delete.confirmTitle")}
              </AlertDialog.Title>
              <AlertDialog.Description size="2">
                {t("adminFolders.delete.confirmBody")}
              </AlertDialog.Description>
              {error && (
                <Callout.Root color="red" mt="3">
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button
                    variant="soft"
                    color="gray"
                    disabled={actionPending}
                  >
                    {t("adminFolders.delete.cancel")}
                  </Button>
                </AlertDialog.Cancel>
                <Button
                  color="red"
                  onClick={runDelete}
                  disabled={actionPending}
                >
                  {t("adminFolders.delete.confirm")}
                </Button>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}
