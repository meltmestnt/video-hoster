"use client";

import Link from "next/link";
import { Button, Flex, Heading, Text } from "@radix-ui/themes";
import { ANON_VIDEO_PREVIEW_SECONDS } from "@repo/shared";
import { useT } from "@/lib/i18n";

interface Props {
  callbackPath: string;
}

/**
 * Rendered inside the player frame once an anonymous viewer has watched
 * the preview window. Doubles as the dead-end for the playback gate —
 * the player won't unpause while this is on screen, so the only paths
 * forward are sign-in or leaving the page.
 */
export function AnonPreviewLock({ callbackPath }: Props) {
  const t = useT();
  return (
    <Flex direction="column" align="center" gap="3" style={{ color: "white" }}>
      <Heading size="5" style={{ color: "white" }}>
        {t("anonPreview.title")}
      </Heading>
      <Text size="2" style={{ color: "rgba(255,255,255,0.85)", maxWidth: 360 }}>
        {t("anonPreview.body", { seconds: ANON_VIDEO_PREVIEW_SECONDS })}
      </Text>
      <Flex gap="3" mt="2">
        <Button asChild size="2" variant="solid" color="iris">
          <Link href={`/login?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            {t("anonPreview.signIn")}
          </Link>
        </Button>
        <Button asChild size="2" variant="soft" color="gray">
          <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackPath)}`}>
            {t("anonPreview.signUp")}
          </Link>
        </Button>
      </Flex>
    </Flex>
  );
}
