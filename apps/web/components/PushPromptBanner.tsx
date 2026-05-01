"use client";

import { Box, Button, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross1Icon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import {
  readPushPromptDismissed,
  usePushSubscription,
  writePushPromptDismissed,
} from "@/lib/push";
import { useT } from "@/lib/i18n";

/**
 * One-time prompt that appears in the bottom-right corner asking signed-in
 * users to enable browser notifications. Shows only when:
 *  - the browser supports Web Push,
 *  - permission is "default" (we haven't been blocked),
 *  - the user hasn't dismissed the prompt before (localStorage flag),
 *  - and they're not already subscribed.
 *
 * Always-on toggle lives in the user menu — this banner is the discovery
 * surface, not the management surface.
 */
export function PushPromptBanner() {
  const t = useT();
  const { status, enable, isBusy } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true);

  // Read the local-storage flag on mount; default-true above keeps the
  // banner from flashing during SSR.
  useEffect(() => {
    setDismissed(readPushPromptDismissed());
  }, []);

  if (dismissed) return null;
  if (status !== "default") return null;

  const onEnable = async () => {
    const ok = await enable();
    // Either way (granted, blocked, or dismissed at the OS level) we don't
    // want to show this again automatically — the user can re-enable from
    // the user menu.
    writePushPromptDismissed();
    setDismissed(true);
    return ok;
  };

  const onDismiss = () => {
    writePushPromptDismissed();
    setDismissed(true);
  };

  return (
    <Box
      role="dialog"
      aria-labelledby="push-prompt-title"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 999,
        maxWidth: 360,
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--gray-5)",
        background: "var(--gray-1)",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
      }}
    >
      <Flex direction="column" gap="3">
        <Flex justify="between" align="start" gap="3">
          <Text
            as="div"
            id="push-prompt-title"
            size="3"
            weight="medium"
            style={{ paddingRight: 24 }}
          >
            {t("push.prompt.title")}
          </Text>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={onDismiss}
            aria-label={t("push.prompt.dismiss")}
          >
            <Cross1Icon />
          </IconButton>
        </Flex>
        <Text as="div" size="2" color="gray">
          {t("push.prompt.body")}
        </Text>
        <Flex gap="2" justify="end">
          <Button variant="soft" color="gray" size="2" onClick={onDismiss}>
            {t("push.prompt.dismiss")}
          </Button>
          <Button size="2" onClick={onEnable} disabled={isBusy}>
            {t("push.prompt.enable")}
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}
