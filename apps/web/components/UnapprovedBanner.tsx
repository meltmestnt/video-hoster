"use client";

import { Box, Callout, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

interface Props {
  /**
   * SSR-resolved fields forwarded from the (app) layout's auth.me query
   * so the banner can decide on the first paint right after login,
   * instead of waiting for the client-side trpc query to resolve.
   */
  initialStatus?: "verified" | "unverified" | null;
  initialApproved?: boolean | null;
  initialRole?: "admin" | "user" | null;
}

/**
 * Yellow banner shown to verified-but-not-yet-approved users so they
 * understand why their daily upload caps are tighter than usual.
 *
 * Only renders for users that are status="verified" but approved=false.
 * Unverified users see the (existing) UnverifiedBanner above instead;
 * verified+approved users and signed-out viewers see nothing.
 */
export function UnapprovedBanner({
  initialStatus,
  initialApproved,
  initialRole,
}: Props = {}) {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  // Prefer the live query result when it has resolved; otherwise fall
  // back to the SSR-provided fields. Avoids the post-login flash where
  // the banner stayed hidden until the client trpc round-trip completed.
  const status = me.data?.status ?? initialStatus ?? null;
  const approved = me.data?.approved ?? initialApproved ?? null;
  const role = me.data?.role ?? initialRole ?? null;
  if (
    !status ||
    status !== "verified" ||
    approved ||
    // Admins bypass every quota gate downstream — never bother them with
    // the "waiting on admin approval" banner even if their row's
    // `approved` column happens to be false (it gets auto-flipped on next
    // load by syncRoleFromEnv, but skip the banner in the meantime).
    role === "admin"
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
