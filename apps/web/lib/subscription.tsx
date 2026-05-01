"use client";

import { type ReactNode } from "react";
import type { SubscriptionTier } from "@repo/shared";
import { trpc } from "@/lib/trpc";

const RANK: Record<SubscriptionTier, number> = { free: 0, pro: 1 };

/**
 * Source of truth for the viewer's current tier on the client. Reads
 * `auth.me`, which is already cached + invalidated by the rest of the app,
 * and falls back to `"free"` while the query is loading or when signed
 * out — feature gates should fail closed, not open.
 *
 * Admins are always treated as Pro so the team can use paid features
 * without manually subscribing themselves.
 */
export function useTier(): SubscriptionTier {
  const me = trpc.auth.me.useQuery();
  if (me.data?.role === "admin") return "pro";
  return me.data?.subscriptionTier ?? "free";
}

export function useIsPro(): boolean {
  return useTier() === "pro";
}

/**
 * Whether the signed-in viewer has confirmed their email. Action UI (like,
 * comment, upload, etc.) should be hidden or disabled when this returns
 * false. Pair with a verified server procedure for the actual gate.
 *
 * Returns false while `auth.me` is loading or for signed-out viewers — the
 * server will reject regardless, but failing closed avoids a flash of
 * "active" UI before the query resolves.
 */
export function useIsVerified(): boolean {
  const me = trpc.auth.me.useQuery();
  return me.data?.status === "verified";
}

export function meetsTier(
  current: SubscriptionTier,
  required: SubscriptionTier,
): boolean {
  return RANK[current] >= RANK[required];
}

interface RequiresProps {
  tier: SubscriptionTier;
  children: ReactNode;
  /** Rendered when the viewer doesn't meet the required tier. */
  fallback?: ReactNode;
}

/**
 * Client-side feature gate. Hides children unless the viewer meets the
 * required tier. This is UX, not a security boundary — always pair with a
 * `proProcedure` (or other tier-gated procedure) on the server.
 */
export function RequiresTier({ tier, children, fallback = null }: RequiresProps) {
  const current = useTier();
  if (!meetsTier(current, tier)) return <>{fallback}</>;
  return <>{children}</>;
}

export function RequiresPro({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <RequiresTier tier="pro" fallback={fallback}>
      {children}
    </RequiresTier>
  );
}
