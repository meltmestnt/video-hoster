"use client";

import { Box, Callout, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

interface Props {
  /**
   * Server-rendered status, forwarded from the (app) layout's auth.me
   * query. Lets the banner decide on the first paint right after login
   * without waiting for the client-side trpc query to resolve. The live
   * client query takes over once it has data so an admin flipping the
   * status while the page is open still updates the banner.
   */
  initialStatus?: "verified" | "unverified" | null;
}

/**
 * Sits at the top of every signed-in page and reminds users with a
 * `status === "unverified"` account that they can browse but can't
 * react / comment / upload until they confirm their email. The actual
 * gate is server-side (`verifiedProcedure`); this is just so the user
 * isn't confused about why their clicks 403.
 *
 * Renders nothing for verified users, signed-out viewers, or while we
 * have no data at all (initial mount with no server-side hint).
 */
export function UnverifiedBanner({ initialStatus }: Props = {}) {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  // Prefer the live query result when it has resolved; otherwise fall
  // back to the SSR-provided status. This avoids the post-login flash
  // where the cached anonymous null was making the banner stay hidden
  // until the fresh /trpc/auth.me round-trip completed.
  const status: "verified" | "unverified" | null =
    me.data?.status ?? initialStatus ?? null;
  if (!status || status === "verified") return null;

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
