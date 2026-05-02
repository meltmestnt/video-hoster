"use client";

import Link from "next/link";
import { useState } from "react";
import { Box, Button, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { FolderCreateDialog } from "@/components/FolderCreateDialog";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type FolderList = inferRouterOutputs<AppRouter>["folders"]["list"];

interface Props {
  initial: FolderList;
}

export function FoldersClient({ initial }: Props) {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);
  const folders = trpc.folders.list.useQuery(undefined, {
    initialData: initial,
    staleTime: 10_000,
  });

  const items = folders.data ?? [];

  const formatCount = (n: number) => {
    if (n === 0) return t("folders.card.gifs.zero");
    if (n === 1) return t("folders.card.gifs.one");
    return t("folders.card.gifs.many", { n });
  };

  return (
    <>
      <Flex justify="end" mb="4">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon /> {t("folders.create.button")}
        </Button>
      </Flex>

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
            {t("folders.empty.title")}
          </Heading>
          <Text as="p" color="gray" size="2" mb="4">
            {t("folders.empty.body")}
          </Text>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon /> {t("folders.empty.cta")}
          </Button>
        </Box>
      ) : (
        <div className="dashboard-grid">
          {items.map((folder) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              style={{ display: "block" }}
            >
              <Card style={{ cursor: "pointer" }}>
                <Flex direction="column" gap="2" p="2">
                  <Text as="div" size="3" weight="medium" truncate>
                    {folder.name}
                  </Text>
                  <Text as="div" size="2" color="gray">
                    {formatCount(folder.gifCount)}
                  </Text>
                </Flex>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <FolderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
