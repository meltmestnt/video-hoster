"use client";

import { useMemo, useState } from "react";
import {
  AlertDialog,
  Avatar,
  Badge,
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

type AdminListResult = inferRouterOutputs<AppRouter>["admin"]["listUsers"];
type UserRow = AdminListResult["items"][number];

interface Props {
  initial: AdminListResult;
  myId: string;
}

export function ManageUsersList({ initial, myId }: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");

  // Server returns 50 at a time; we keep the initial page hot-cached and let
  // additional pages stream in via the cursor on "Load more".
  const list = trpc.admin.listUsers.useInfiniteQuery(
    { limit: 50, q: q || undefined },
    {
      initialData: q
        ? undefined
        : { pages: [initial], pageParams: [undefined] },
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items: UserRow[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const refresh = () => utils.admin.listUsers.invalidate();

  const verify = trpc.admin.verifyUser.useMutation({ onSuccess: refresh });
  const unverify = trpc.admin.unverifyUser.useMutation({ onSuccess: refresh });
  const remove = trpc.admin.deleteUser.useMutation({ onSuccess: refresh });

  return (
    <Flex direction="column" gap="3">
      <Box style={{ maxWidth: 360 }}>
        <TextField.Root
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("manage.search.placeholder")}
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
          <Text color="gray">{t("manage.empty")}</Text>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                {t("manage.col.user")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.email")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.role")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.status")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.joined")}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {t("manage.col.actions")}
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((u) => (
              <UserRowView
                key={u.id}
                row={u}
                isSelf={u.id === myId}
                onVerify={() => verify.mutateAsync({ userId: u.id })}
                onUnverify={() =>
                  unverify.mutateAsync({ userId: u.id })
                }
                onDelete={() => remove.mutateAsync({ userId: u.id })}
                actionPending={
                  verify.isPending || unverify.isPending || remove.isPending
                }
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
            {list.isFetchingNextPage
              ? t("manage.loadingMore")
              : t("manage.loadMore")}
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

function UserRowView({
  row,
  isSelf,
  onVerify,
  onUnverify,
  onDelete,
  actionPending,
}: {
  row: UserRow;
  isSelf: boolean;
  onVerify: () => Promise<unknown>;
  onUnverify: () => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  actionPending: boolean;
}) {
  const t = useT();
  const [unverifyOpen, setUnverifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = row.role === "admin";
  // The API blocks self / admin actions, but we also hide the buttons so
  // admins don't bother clicking and discovering a 403.
  const actionsLocked = isSelf || isAdmin;
  const isVerified = row.status === "verified";

  const runVerify = async () => {
    setError(null);
    try {
      await onVerify();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const runUnverify = async () => {
    setError(null);
    try {
      await onUnverify();
      setUnverifyOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
        <Flex align="center" gap="2">
          <Avatar
            size="1"
            src={row.avatarUrl ?? undefined}
            fallback={row.name.slice(0, 1).toUpperCase()}
            radius="full"
          />
          <Text size="2" weight="medium">
            {row.name}
          </Text>
        </Flex>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray">
          {row.email}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Badge
          color={isAdmin ? "iris" : "gray"}
          variant={isAdmin ? "solid" : "soft"}
          radius="full"
        >
          {isAdmin ? t("manage.role.admin") : t("manage.role.user")}
        </Badge>
      </Table.Cell>
      <Table.Cell>
        <Badge
          color={row.status === "verified" ? "green" : "amber"}
          variant="soft"
          radius="full"
        >
          {row.status === "verified"
            ? t("user.profile.verified")
            : t("user.profile.unverified")}
        </Badge>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray">
          {new Date(row.createdAt).toLocaleDateString()}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {actionsLocked ? (
          <Text size="1" color="gray">
            —
          </Text>
        ) : (
          <Flex gap="2">
            {isVerified ? (
              // Verified → can be revoked. Confirmation dialog because this
              // strips access to write actions.
              <AlertDialog.Root
                open={unverifyOpen}
                onOpenChange={(o) => {
                  setUnverifyOpen(o);
                  if (!o) setError(null);
                }}
              >
                <AlertDialog.Trigger>
                  <Button
                    size="1"
                    variant="soft"
                    color="amber"
                    disabled={actionPending}
                  >
                    {t("manage.action.unverify")}
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Content maxWidth="440px">
                  <AlertDialog.Title>
                    {t("manage.unverify.title", { name: row.name })}
                  </AlertDialog.Title>
                  <AlertDialog.Description size="2">
                    {t("manage.unverify.body", { email: row.email })}
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
                        {t("common.cancel")}
                      </Button>
                    </AlertDialog.Cancel>
                    <Button
                      color="amber"
                      onClick={runUnverify}
                      disabled={actionPending}
                    >
                      {actionPending
                        ? t("manage.unverifying")
                        : t("manage.action.unverify")}
                    </Button>
                  </Flex>
                </AlertDialog.Content>
              </AlertDialog.Root>
            ) : (
              // Unverified → one-click approve. No dialog because granting
              // access isn't destructive — admin can always Unverify after.
              <Button
                size="1"
                variant="soft"
                color="green"
                onClick={runVerify}
                disabled={actionPending}
              >
                {actionPending
                  ? t("manage.verifying")
                  : t("manage.action.verify")}
              </Button>
            )}

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
                  {t("manage.action.delete")}
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Content maxWidth="440px">
                <AlertDialog.Title>
                  {t("manage.delete.title", { name: row.name })}
                </AlertDialog.Title>
                <AlertDialog.Description size="2">
                  {t("manage.delete.body", { email: row.email })}
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
                      {t("common.cancel")}
                    </Button>
                  </AlertDialog.Cancel>
                  <Button
                    color="red"
                    onClick={runDelete}
                    disabled={actionPending}
                  >
                    {actionPending
                      ? t("manage.deleting")
                      : t("manage.action.delete")}
                  </Button>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          </Flex>
        )}
      </Table.Cell>
    </Table.Row>
  );
}
