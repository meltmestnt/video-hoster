"use client";

import { useState } from "react";
import { Button } from "@radix-ui/themes";
import { StarIcon, StarFilledIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

interface Props {
  videoId: string;
  initial: boolean;
}

export function FavoriteButton({ videoId, initial }: Props) {
  const t = useT();
  const utils = trpc.useUtils();
  const [favorited, setFavorited] = useState(initial);
  const toggle = trpc.favorites.toggle.useMutation({
    onMutate: () => {
      const next = !favorited;
      setFavorited(next);
      return { previous: !next };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) setFavorited(ctx.previous);
    },
    onSuccess: ({ favorited: server }) => {
      setFavorited(server);
    },
    onSettled: () => {
      utils.videos.byId.invalidate({ id: videoId });
      utils.videos.favorites.invalidate();
    },
  });

  return (
    <Button
      variant={favorited ? "solid" : "soft"}
      color={favorited ? "amber" : "gray"}
      onClick={() => toggle.mutate({ videoId })}
      disabled={toggle.isPending}
    >
      {favorited ? <StarFilledIcon /> : <StarIcon />}
      {favorited ? t("favorite.button.on") : t("favorite.button.off")}
    </Button>
  );
}
