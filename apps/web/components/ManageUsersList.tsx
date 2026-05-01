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
  IconButton,
  Table,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  EnvelopeClosedIcon,
  EnvelopeOpenIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
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
      // Refetch every minute so the presence dots stay fresh — the
      // server's online window is 5 minutes, but a 60s poll keeps the
      // perceived freshness tight without spamming the API.
      refetchInterval: 60_000,
    },
  );

  const items: UserRow[] = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data],
  );

  const refresh = () => utils.admin.listUsers.invalidate();

  const verify = trpc.admin.verifyUser.useMutation({ onSuccess: refresh });
  const unverify = trpc.admin.unverifyUser.useMutation({ onSuccess: refresh });
  const approve = trpc.admin.approveUser.useMutation({ onSuccess: refresh });
  const unapprove = trpc.admin.unapproveUser.useMutation({
    onSuccess: refresh,
  });
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
                onApprove={() => approve.mutateAsync({ userId: u.id })}
                onUnapprove={() =>
                  unapprove.mutateAsync({ userId: u.id })
                }
                onDelete={() => remove.mutateAsync({ userId: u.id })}
                actionPending={
                  verify.isPending ||
                  unverify.isPending ||
                  approve.isPending ||
                  unapprove.isPending ||
                  remove.isPending
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
  onApprove,
  onUnapprove,
  onDelete,
  actionPending,
}: {
  row: UserRow;
  isSelf: boolean;
  onVerify: () => Promise<unknown>;
  onUnverify: () => Promise<unknown>;
  onApprove: () => Promise<unknown>;
  onUnapprove: () => Promise<unknown>;
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
  const isApproved = row.approved;

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

  const runApprove = async () => {
    setError(null);
    try {
      await onApprove();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const runUnapprove = async () => {
    setError(null);
    try {
      await onUnapprove();
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
          {/* Avatar + presence dot. The dot is positioned over the
              bottom-right of the avatar (Telegram / Slack pattern).
              The wrapping Box gives the absolute-positioned indicator
              something to anchor to without needing to add layout to
              the Avatar itself. */}
          <Box style={{ position: "relative", flexShrink: 0 }}>
            <Avatar
              size="1"
              src={row.avatarUrl ?? undefined}
              fallback={row.name.slice(0, 1).toUpperCase()}
              radius="full"
            />
            {row.online && (
              <Tooltip content={t("manage.presence.online")}>
                <span
                  aria-label={t("manage.presence.online")}
                  style={{
                    position: "absolute",
                    right: -2,
                    bottom: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: "var(--green-9)",
                    border: "2px solid var(--gray-1)",
                    boxShadow: "0 0 0 1px var(--green-7)",
                  }}
                />
              </Tooltip>
            )}
          </Box>
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
        {/* Stack the two badges vertically with consistent width — wrapping
            them inline produced uneven row heights when the localized
            "Не підтверджено" / "Не схвалено" labels overflowed. */}
        <Flex direction="column" gap="1" align="start">
          <Badge
            color={row.status === "verified" ? "green" : "amber"}
            variant="soft"
            radius="full"
          >
            {row.status === "verified"
              ? t("user.profile.verified")
              : t("user.profile.unverified")}
          </Badge>
          <Badge
            color={row.approved ? "green" : "amber"}
            variant="soft"
            radius="full"
          >
            {row.approved
              ? t("manage.status.approved")
              : t("manage.status.unapproved")}
          </Badge>
        </Flex>
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
          <Flex gap="2" wrap="nowrap">
            {/* Icon buttons keep the column's width fixed regardless of
                language. Long Ukrainian labels ("Скасувати підтвердження")
                were dominating the row and pushing other columns out. The
                tooltip carries the same label for sighted users; the icon
                conveys intent at a glance. */}
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
                <Tooltip content={t("manage.action.unverify")}>
                  <AlertDialog.Trigger>
                    <IconButton
                      size="2"
                      variant="soft"
                      color="amber"
                      disabled={actionPending}
                      aria-label={t("manage.action.unverify")}
                    >
                      <EnvelopeClosedIcon />
                    </IconButton>
                  </AlertDialog.Trigger>
                </Tooltip>
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
              <Tooltip content={t("manage.action.verify")}>
                <IconButton
                  size="2"
                  variant="soft"
                  color="green"
                  onClick={runVerify}
                  disabled={actionPending}
                  aria-label={t("manage.action.verify")}
                >
                  <EnvelopeOpenIcon />
                </IconButton>
              </Tooltip>
            )}

            {/* Approve / Unapprove — separate axis from email verification.
                Both directions are one-click since they only adjust the
                daily upload caps; reverse is always available. */}
            {isApproved ? (
              <Tooltip content={t("manage.action.unapprove")}>
                <IconButton
                  size="2"
                  variant="soft"
                  color="amber"
                  onClick={runUnapprove}
                  disabled={actionPending}
                  aria-label={t("manage.action.unapprove")}
                >
                  <CrossCircledIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip content={t("manage.action.approve")}>
                <IconButton
                  size="2"
                  variant="soft"
                  color="iris"
                  onClick={runApprove}
                  disabled={actionPending}
                  aria-label={t("manage.action.approve")}
                >
                  <CheckCircledIcon />
                </IconButton>
              </Tooltip>
            )}

            <AlertDialog.Root
              open={deleteOpen}
              onOpenChange={(o) => {
                setDeleteOpen(o);
                if (!o) setError(null);
              }}
            >
              <Tooltip content={t("manage.action.delete")}>
                <AlertDialog.Trigger>
                  <IconButton
                    size="2"
                    variant="soft"
                    color="red"
                    disabled={actionPending}
                    aria-label={t("manage.action.delete")}
                  >
                    <TrashIcon />
                  </IconButton>
                </AlertDialog.Trigger>
              </Tooltip>
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
