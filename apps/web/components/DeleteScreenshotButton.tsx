"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Callout, Flex } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

interface Props {
  screenshotId: string;
  title: string;
}

export function DeleteScreenshotButton({ screenshotId, title }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = trpc.screenshots.delete.useMutation();

  const submit = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ id: screenshotId });
      await utils.screenshots.list.invalidate();
      router.push("/screenshots");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger>
        <Button color="red" variant="soft">
          {t("common.delete")}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="440px">
        <AlertDialog.Title>{t("delete.screenshot.title")}</AlertDialog.Title>
        <AlertDialog.Description size="2">
          {t("delete.screenshot.body", { title })}
        </AlertDialog.Description>
        {error && (
          <Callout.Root color="red" mt="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={remove.isPending}>
              {t("common.cancel")}
            </Button>
          </AlertDialog.Cancel>
          <Button color="red" onClick={submit} disabled={remove.isPending}>
            {remove.isPending ? t("common.deleting") : t("common.delete")}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
