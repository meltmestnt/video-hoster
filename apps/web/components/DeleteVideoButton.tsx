"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog, Button, Callout, Flex } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useMiniPlayer } from "@/lib/mini-player-context";

interface Props {
  videoId: string;
  title: string;
}

export function DeleteVideoButton({ videoId, title }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const mini = useMiniPlayer();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteVideo = trpc.videos.delete.useMutation();

  const submit = async () => {
    setError(null);
    try {
      await deleteVideo.mutateAsync({ id: videoId });
      // Drop the deleted video from the mini-player context so it doesn't
      // pop up with a now-invalid S3 URL after we navigate away.
      if (mini.video?.id === videoId) {
        mini.close();
      }
      await utils.videos.list.invalidate();
      router.push("/");
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
        <AlertDialog.Title>Delete video?</AlertDialog.Title>
        <AlertDialog.Description size="2">
          "{title}" will be permanently removed, along with its thumbnail and
          uploaded file. This cannot be undone.
        </AlertDialog.Description>

        {error && (
          <Callout.Root color="red" mt="3">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={deleteVideo.isPending}>
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <Button
            color="red"
            onClick={submit}
            disabled={deleteVideo.isPending}
          >
            {deleteVideo.isPending ? "Deleting..." : "Delete"}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
