"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Dialog,
  Flex,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { FOLDER_NAME_MAX_LEN } from "@repo/shared";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { useVerifyRequired } from "./VerifyRequiredDialog";

// Radix Select disallows empty-string values, so we use a stable sentinel
// for the null option and another for the inline-create entry.
const NONE_VALUE = "__none__";
const CREATE_VALUE = "__create__";

interface Props {
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
  /** Label shown for the null option (e.g. "(no folder)"). */
  noneLabel: string;
  /** Show a "+ New folder…" item that opens an inline create dialog. */
  allowCreate?: boolean;
  /** Optional aria-label / placeholder hint for the trigger. */
  ariaLabel?: string;
}

/**
 * Reusable folder dropdown. Always offers a "none" option, optionally an
 * inline "+ New folder…" item that opens a small dialog and selects the
 * newly created folder on success.
 */
export function FolderPickerSelect({
  value,
  onChange,
  disabled,
  noneLabel,
  allowCreate,
  ariaLabel,
}: Props) {
  const t = useT();
  const folders = trpc.folders.list.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.folders.create.useMutation();
  const me = trpc.auth.me.useQuery();
  const verifyRequired = useVerifyRequired();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = folders.data ?? [];
  const selectValue = value ?? NONE_VALUE;

  const onValueChange = (next: string) => {
    if (next === CREATE_VALUE) {
      // Same verification gate FolderCreateDialog uses — caller picked
      // "+ New folder…" from the dropdown but the API will reject the
      // create. Surface the standard verify-required dialog before we
      // even render the inline dialog here.
      if (me.data && me.data.status !== "verified") {
        verifyRequired.show("action", "unverified");
        return;
      }
      setName("");
      setError(null);
      setCreateOpen(true);
      return;
    }
    if (next === NONE_VALUE) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(t("folders.error.nameRequired"));
      return;
    }
    if (trimmed.length > FOLDER_NAME_MAX_LEN) {
      setError(t("folders.error.nameTooLong"));
      return;
    }
    setError(null);
    try {
      const created = await create.mutateAsync({ name: trimmed });
      // Refresh the list so the new folder shows up immediately on the
      // next dropdown open, then select it.
      await utils.folders.list.invalidate();
      onChange(created.id);
      setCreateOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <Select.Root
        value={selectValue}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <Select.Trigger aria-label={ariaLabel} placeholder={noneLabel} />
        <Select.Content>
          <Select.Item value={NONE_VALUE}>{noneLabel}</Select.Item>
          {items.length > 0 && <Select.Separator />}
          {items.map((f) => (
            <Select.Item key={f.id} value={f.id}>
              {f.name}
            </Select.Item>
          ))}
          {allowCreate && (
            <>
              <Select.Separator />
              <Select.Item value={CREATE_VALUE}>
                {t("gifCard.menu.addToFolder.create")}
              </Select.Item>
            </>
          )}
        </Select.Content>
      </Select.Root>

      {allowCreate && (
        <Dialog.Root
          open={createOpen}
          onOpenChange={(o) => {
            // Ignore close attempts mid-mutation so the user doesn't
            // half-create a folder by hitting Escape.
            if (!o && create.isPending) return;
            setCreateOpen(o);
            if (!o) {
              setName("");
              setError(null);
            }
          }}
        >
          <Dialog.Content maxWidth="420px">
            <Dialog.Title>{t("folders.create.dialog.title")}</Dialog.Title>
            <Flex direction="column" gap="3" mt="2">
              <TextField.Root
                placeholder={t("folders.create.dialog.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={FOLDER_NAME_MAX_LEN}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitCreate();
                  }
                }}
                disabled={create.isPending}
              />
              {error && (
                <Callout.Root color="red" size="1">
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              )}
              <Text size="1" color="gray">
                {name.trim().length}/{FOLDER_NAME_MAX_LEN}
              </Text>
            </Flex>
            <Flex gap="3" mt="4" justify="end">
              <Button
                variant="soft"
                color="gray"
                onClick={() => setCreateOpen(false)}
                disabled={create.isPending}
              >
                {t("folders.create.dialog.cancel")}
              </Button>
              <Button
                onClick={submitCreate}
                disabled={create.isPending || name.trim().length === 0}
              >
                {t("folders.create.dialog.submit")}
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  );
}
