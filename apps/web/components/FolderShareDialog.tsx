"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Callout,
  Dialog,
  Flex,
  IconButton,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Cross2Icon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { trackEvent } from "@/lib/analytics";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  folderName: string;
}

export function FolderShareDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
}: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const share = trpc.folders.share.useMutation();
  const unshare = trpc.folders.unshare.useMutation();

  const shares = trpc.folders.listShares.useQuery(
    { folderId },
    { enabled: open, staleTime: 10_000 },
  );

  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHandle("");
      setError(null);
      setInfo(null);
    }
  }, [open]);

  const mapErrorMessage = (raw: string): string => {
    const lc = raw.toLowerCase();
    if (lc.includes("yourself")) return t("folderShare.errSelf");
    if (lc.includes("no user found")) return t("folderShare.errNotFound");
    if (lc.includes("already shared with") && lc.includes("people")) {
      return t("folderShare.errCap");
    }
    return raw;
  };

  const submit = async () => {
    const trimmed = handle.trim();
    if (trimmed.length === 0) return;
    setError(null);
    setInfo(null);
    try {
      const result = await share.mutateAsync({
        folderId,
        recipientHandle: trimmed,
      });
      // Only fire on a genuinely new share — re-submitting an existing
      // recipient (alreadyShared) isn't a new cross-user link, just a
      // no-op from the server's perspective.
      if (!result.alreadyShared) {
        trackEvent("Folder Shared");
      }
      await utils.folders.listShares.invalidate({ folderId });
      if (result.alreadyShared) {
        setInfo(
          t("folderShare.alreadyShared", { name: result.recipient.name }),
        );
      } else {
        setInfo(t("folderShare.success", { name: result.recipient.name }));
      }
      setHandle("");
    } catch (err) {
      setError(mapErrorMessage((err as Error).message));
    }
  };

  const handleRemove = async (recipientUserId: string) => {
    try {
      await unshare.mutateAsync({ folderId, recipientUserId });
      await utils.folders.listShares.invalidate({ folderId });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const items = shares.data ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>
          {t("folderShare.dialog.title")}
          {folderName && (
            <Text as="span" size="3" color="gray" weight="regular">
              {" "}
              — {folderName}
            </Text>
          )}
        </Dialog.Title>
        <Text as="p" size="2" color="gray" mt="1">
          {t("folderShare.dialog.body")}
        </Text>
        <Flex direction="column" gap="3" mt="3">
          <Flex gap="2" align="start">
            <Box style={{ flex: 1 }}>
              <TextField.Root
                autoFocus
                placeholder={t("folderShare.input.placeholder")}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  if (error) setError(null);
                  if (info) setInfo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !share.isPending) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            </Box>
            <Button
              onClick={submit}
              disabled={share.isPending || handle.trim().length === 0}
            >
              {t("folderShare.share")}
            </Button>
          </Flex>
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {info && (
            <Callout.Root color="green">
              <Callout.Text>{info}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Separator size="4" my="4" />

        <Text as="div" size="2" weight="medium" mb="2">
          {t("folderShare.shareesHeader")}
        </Text>
        {items.length === 0 ? (
          <Text as="p" size="2" color="gray">
            {t("folderShare.empty")}
          </Text>
        ) : (
          <Flex direction="column" gap="2">
            {items.map((s) => (
              <Flex
                key={s.shareId}
                align="center"
                justify="between"
                gap="3"
                style={{
                  padding: "8px 12px",
                  background: "var(--gray-2)",
                  borderRadius: "var(--radius-2)",
                }}
              >
                <Box style={{ minWidth: 0 }}>
                  <Text as="div" size="2" weight="medium" truncate>
                    {s.user.name}
                  </Text>
                  <Text as="div" size="1" color="gray" truncate>
                    {s.user.email}
                  </Text>
                </Box>
                <IconButton
                  variant="soft"
                  color="red"
                  size="1"
                  aria-label={t("folderShare.remove")}
                  title={t("folderShare.remove")}
                  disabled={unshare.isPending}
                  onClick={() => {
                    void handleRemove(s.user.id);
                  }}
                >
                  <Cross2Icon />
                </IconButton>
              </Flex>
            ))}
          </Flex>
        )}

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              {t("folderShare.cancel")}
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
