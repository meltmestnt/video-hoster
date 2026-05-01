"use client";

import { Button, Tooltip } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useRequireAuth } from "@/lib/auth-required";
import { useT } from "@/lib/i18n";

interface Props {
  targetUserId: string;
  // Hide entirely when the viewer is the target — no point subscribing to
  // yourself. The page can also choose to render nothing instead.
  hideForSelf?: boolean;
}

export function SubscribeButton({ targetUserId, hideForSelf = true }: Props) {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const requireAuth = useRequireAuth();
  const t = useT();

  const status = trpc.subscriptions.isSubscribed.useQuery(
    { userId: targetUserId },
    { enabled: !!me.data, staleTime: 10_000 },
  );

  const toggle = trpc.subscriptions.toggle.useMutation({
    onMutate: async () => {
      await utils.subscriptions.isSubscribed.cancel({ userId: targetUserId });
      const previous = utils.subscriptions.isSubscribed.getData({
        userId: targetUserId,
      });
      utils.subscriptions.isSubscribed.setData(
        { userId: targetUserId },
        !previous,
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        utils.subscriptions.isSubscribed.setData(
          { userId: targetUserId },
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      utils.subscriptions.isSubscribed.invalidate({ userId: targetUserId });
      utils.subscriptions.followerCount.invalidate({ userId: targetUserId });
      utils.subscriptions.following.invalidate();
      utils.subscriptions.followers.invalidate();
    },
  });

  if (hideForSelf && me.data?.id === targetUserId) return null;

  const subscribed = !!status.data;
  const onClick = () => {
    if (!requireAuth()) return;
    toggle.mutate({ userId: targetUserId });
  };

  return (
    <Tooltip
      content={
        subscribed
          ? t("subscribe.tooltip.subscribed")
          : t("subscribe.tooltip.unsubscribed")
      }
    >
      <Button
        size="2"
        variant={subscribed ? "soft" : "solid"}
        color={subscribed ? "gray" : undefined}
        onClick={onClick}
        disabled={toggle.isPending || status.isLoading}
      >
        {subscribed
          ? t("subscribe.button.subscribed")
          : t("subscribe.button.unsubscribed")}
      </Button>
    </Tooltip>
  );
}
