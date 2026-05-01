"use client";

import { Box, Callout, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

/**
 * Sits at the top of every signed-in page and reminds users with a
 * `status === "unverified"` account that they can browse but can't
 * react / comment / upload until they confirm their email. The actual
 * gate is server-side (`verifiedProcedure`); this is just so the user
 * isn't confused about why their clicks 403.
 *
 * Renders nothing for verified users, signed-out viewers, or while the
 * query is loading — fails closed so the banner doesn't flash on load.
 */
export function UnverifiedBanner() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  // Only show when we actually know the user is unverified.
  if (!me.data || me.data.status === "verified") return null;

  return (
    <Box px="4" pt="3">
      <Callout.Root color="amber" variant="surface">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          <Text weight="medium">{t("unverified.banner.title")}</Text>{" "}
          {t("unverified.banner.body")}
        </Callout.Text>
      </Callout.Root>
    </Box>
  );
}
