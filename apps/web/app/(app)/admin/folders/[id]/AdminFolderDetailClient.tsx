"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { GifCard } from "@/components/GifCard";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@repo/api";

type AdminFolderGifsResult =
  inferRouterOutputs<AppRouter>["admin"]["folderGifs"];

interface Props {
  folderId: string;
  initialName: string;
  owner: { id: string; name: string; email: string };
  gifCount: number;
  shareCount: number;
  initialGifs: AdminFolderGifsResult;
}

export function AdminFolderDetailClient({
  folderId,
  initialName,
  owner,
  gifCount,
  shareCount,
  initialGifs,
}: Props) {
  const t = useT();
  const utils = trpc.useUtils();

  const gifs = trpc.admin.folderGifs.useInfiniteQuery(
    { folderId, limit: 24 },
    {
      initialData: { pages: [initialGifs], pageParams: [undefined] },
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );

  const items = useMemo(
    () => gifs.data?.pages.flatMap((p) => p.items) ?? [],
    [gifs.data],
  );

  const removeGif = trpc.admin.removeFolderGif.useMutation();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleRemove = async (gifId: string) => {
    setPendingId(gifId);
    try {
      await removeGif.mutateAsync({ folderId, gifId });
      await utils.admin.folderGifs.invalidate({ folderId });
      await utils.admin.listFolders.invalidate();
    } catch {
      // Surface nothing — list refetch will resync on next mount.
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <Flex direction="column" gap="1" mb="4">
          <Heading size="6" style={{ wordBreak: "break-word" }}>
            {t("adminFolderDetail.heading", { name: initialName })}
          </Heading>
          <Text as="div" size="2" color="gray">
            {t("adminFolderDetail.owner", {
              name: owner.name,
              email: owner.email,
            })}
          </Text>
          <Flex gap="3" wrap="wrap">
            <Text size="2" color="gray">
              {t("adminFolderDetail.gifCount", { count: gifCount })}
            </Text>
            <Text size="2" color="gray">
              {t("adminFolderDetail.shareCount", { count: shareCount })}
            </Text>
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
          <Text as="p" color="gray" size="2">
            {t("adminFolderDetail.empty")}
          </Text>
        </Box>
      ) : (
        <div className="dashboard-grid">
          {items.map((g, i) => (
            <Box key={g.id} style={{ position: "relative" }}>
              <GifCard gif={g} index={i} />
              {/* Mirrors the user-facing folder detail overlay — sits above
                  the card's add-to-folder button and short-circuits the
                  card's <a> on click. */}
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
                  aria-label={t("adminFolderDetail.removeGif")}
                  title={t("adminFolderDetail.removeGif")}
                  disabled={pendingId === g.id}
                  style={{ opacity: 0.92 }}
                  onClick={() => {
                    void handleRemove(g.id);
                  }}
                >
                  <Cross2Icon />
                </IconButton>
              </div>
            </Box>
          ))}
        </div>
      )}

      {gifs.hasNextPage && (
        <Flex justify="center" mt="4">
          <Button
            variant="soft"
            color="gray"
            onClick={() => gifs.fetchNextPage()}
            disabled={gifs.isFetchingNextPage}
          >
            {t("adminFolders.loadMore")}
          </Button>
        </Flex>
      )}
    </>
  );
}
