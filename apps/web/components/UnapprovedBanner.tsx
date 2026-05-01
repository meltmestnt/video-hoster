"use client";

import { Box, Callout, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

/**
 * Yellow banner shown to verified-but-not-yet-approved users so they
 * understand why their daily upload caps are tighter than usual.
 *
 * Only renders for users that are status="verified" but approved=false.
 * Unverified users see the (existing) UnverifiedBanner above instead;
 * verified+approved users and signed-out viewers see nothing. Fails
 * closed while the auth.me query is loading so the banner doesn't
 * flash on first paint.
 */
export function UnapprovedBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  if (
    !me.data ||
    me.data.status !== "verified" ||
    me.data.approved
  ) {
    return null;
  }
  return (
    <Box px="4" pt="3">
      <Callout.Root color="amber" variant="surface">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          <Text weight="medium">{t("unapproved.banner.title")}</Text>{" "}
          {t("unapproved.banner.body")}
        </Callout.Text>
      </Callout.Root>
    </Box>
  );
}
