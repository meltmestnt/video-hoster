"use client";

import Link from "next/link";
import { Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT, useLocale } from "@/lib/i18n";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type SharedList =
  inferRouterOutputs<AppRouter>["folders"]["listSharedWithMe"];

interface Props {
  initial: SharedList;
}

export function SharedFoldersClient({ initial }: Props) {
  const t = useT();
  const locale = useLocale();
  const utils = trpc.useUtils();

  const folders = trpc.folders.listSharedWithMe.useQuery(undefined, {
    initialData: initial,
    staleTime: 10_000,
  });
  const leaveShare = trpc.folders.leaveShare.useMutation();

  const items = folders.data ?? [];

  const onLeave = async (folderId: string) => {
    try {
      await leaveShare.mutateAsync({ folderId });
      await utils.folders.listSharedWithMe.invalidate();
    } catch {
      // Refetch on next mount will resync.
    }
  };

  const formatDate = (d: Date | string): string => {
    try {
      const date = typeof d === "string" ? new Date(d) : d;
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  };

  if (items.length === 0) {
    return (
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
          {t("sharedFolders.empty")}
        </Heading>
      </Box>
    );
  }

  return (
    <div className="dashboard-grid">
      {items.map((folder) => (
        <Card key={folder.id}>
          <Flex direction="column" gap="2" p="2">
            <Link
              href={`/folders/${folder.id}`}
              style={{ display: "block", textDecoration: "none", color: "inherit" }}
            >
              <Text as="div" size="3" weight="medium" truncate>
                {folder.name}
              </Text>
              <Text as="div" size="2" color="gray">
                {t("sharedFolders.gifCount", { count: folder.gifCount })}
              </Text>
              <Text as="div" size="1" color="gray" mt="1">
                {t("sharedFolders.sharedBy", { name: folder.owner.name })}
              </Text>
              <Text as="div" size="1" color="gray">
                {t("sharedFolders.sharedAt", {
                  date: formatDate(folder.sharedAt),
                })}
              </Text>
            </Link>
            <Flex justify="end" mt="1">
              <Button
                variant="soft"
                color="gray"
                size="1"
                disabled={leaveShare.isPending}
                onClick={() => {
                  void onLeave(folder.id);
                }}
              >
                {t("sharedFolders.leave")}
              </Button>
            </Flex>
          </Flex>
        </Card>
      ))}
    </div>
  );
}
