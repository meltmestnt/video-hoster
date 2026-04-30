"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Callout, Flex } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";

interface Props {
  gifId: string;
  title: string;
}

export function DeleteGifButton({ gifId, title }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = trpc.gifs.delete.useMutation();

  const submit = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ id: gifId });
      await utils.gifs.list.invalidate();
      router.push("/gifs");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger>
        <Button color="red" variant="soft">
          Delete
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="440px">
        <AlertDialog.Title>Delete GIF?</AlertDialog.Title>
        <AlertDialog.Description size="2">
          "{title}" will be permanently removed. This cannot be undone.
        </AlertDialog.Description>
        {error && (
          <Callout.Root color="red" mt="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={remove.isPending}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button color="red" onClick={submit} disabled={remove.isPending}>
            {remove.isPending ? "Deleting..." : "Delete"}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
