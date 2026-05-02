"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Callout,
  Dialog,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { useVerifyRequired } from "./VerifyRequiredDialog";

const NAME_MAX = 80;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folder: { id: string; name: string }) => void;
}

export function FolderCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const create = trpc.folders.create.useMutation();
  const me = trpc.auth.me.useQuery();
  const verifyRequired = useVerifyRequired();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Verify-gate every entry point in one place. When a caller opens this
  // dialog and the viewer isn't verified, swallow the open transition,
  // dismiss it back to closed, and surface the standard verify-required
  // dialog instead. Same kind="action" that Convert uses, so the copy
  // doesn't talk specifically about uploads. Wait for me to load before
  // deciding so the bootstrap-race doesn't false-positive a fresh
  // sign-in.
  useEffect(() => {
    if (!open) return;
    if (me.isLoading || me.data === undefined) return;
    if (me.data && me.data.status !== "verified") {
      onOpenChange(false);
      verifyRequired.show("action", "unverified");
    }
  }, [open, me.isLoading, me.data, onOpenChange, verifyRequired]);

  // Reset whenever the dialog reopens — leftover input/error from a prior
  // attempt would otherwise be the first thing the user sees.
  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("folders.error.nameRequired"));
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setError(t("folders.error.nameTooLong"));
      return;
    }
    setError(null);
    try {
      const folder = await create.mutateAsync({ name: trimmed });
      await utils.folders.list.invalidate();
      onCreated?.({ id: folder.id, name: folder.name });
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="440px">
        <Dialog.Title>{t("folders.create.dialog.title")}</Dialog.Title>
        <Flex direction="column" gap="3" mt="3">
          <TextField.Root
            autoFocus
            placeholder={t("folders.create.dialog.namePlaceholder")}
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !create.isPending) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          <Text size="1" color="gray">
            {name.trim().length}/{NAME_MAX}
          </Text>
        </Flex>
        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={create.isPending}>
              {t("folders.create.dialog.cancel")}
            </Button>
          </Dialog.Close>
          <Button onClick={submit} disabled={create.isPending}>
            {t("folders.create.dialog.submit")}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
