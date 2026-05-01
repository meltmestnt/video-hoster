"use client";

import { signIn, useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";
import { useVerifyRequired } from "@/components/VerifyRequiredDialog";
import type { UnverifiedLimitKind } from "@/lib/unverified-limit";

interface VerifiedActionGuard {
  /**
   * Returns true if the action should proceed. Returns false (and triggers
   * a sign-in flow or the verify dialog as a side-effect) when the viewer
   * is signed-out or known to be unverified. The `kind` parameter only
   * affects copy in the dialog ("video" / "gif" / "screenshot" / "action")
   * — pick whichever fits the surface best.
   */
  ensure: (kind?: UnverifiedLimitKind) => boolean;
  /**
   * Inspect a tRPC error thrown from an action mutation. If it looks like
   * the verifiedProcedure FORBIDDEN reject, opens the dialog and returns
   * true (the caller should swallow the error). Otherwise returns false
   * so the caller can surface the error normally.
   */
  handleError: (err: unknown, kind?: UnverifiedLimitKind) => boolean;
}

/**
 * Client-side gate for verified-only actions (reactions, comments,
 * subscribe, favorites, etc.). Pre-empts the network call when we
 * already know the user is unverified, and falls back to translating
 * a server FORBIDDEN into the same dialog if our local check raced
 * with the action.
 */
export function useEnsureVerified(): VerifiedActionGuard {
  const session = useSession();
  const me = trpc.auth.me.useQuery();
  const { show } = useVerifyRequired();

  const ensure = (kind: UnverifiedLimitKind = "action") => {
    if (!session.data) {
      signIn();
      return false;
    }
    // Only block when we have a positive answer from /auth.me. If the
    // query hasn't resolved yet, allow the click and rely on the server
    // to reject — handleError() picks up FORBIDDEN below.
    if (me.data?.status === "unverified") {
      show(kind, "unverified");
      return false;
    }
    return true;
  };

  const handleError = (err: unknown, kind: UnverifiedLimitKind = "action") => {
    const code =
      typeof err === "object" && err !== null
        ? (err as { data?: { code?: unknown } }).data?.code
        : undefined;
    if (code === "FORBIDDEN") {
      show(kind, "unverified");
      return true;
    }
    return false;
  };

  return { ensure, handleError };
}
