"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { AlertDialog, Button, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";

interface AuthRequiredContextValue {
  /**
   * If the viewer is signed in, returns true and lets the caller proceed.
   * Otherwise opens the sign-in / sign-up dialog and returns false.
   */
  requireAuth: () => boolean;
}

const Ctx = createContext<AuthRequiredContextValue | null>(null);

export function AuthRequiredProvider({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const requireAuth = useCallback(() => {
    if (signedIn) return true;
    setOpen(true);
    return false;
  }, [signedIn]);

  const value = useMemo(() => ({ requireAuth }), [requireAuth]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AuthRequiredDialog open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

function AuthRequiredDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="420px">
        <AlertDialog.Title>{t("auth.required.title")}</AlertDialog.Title>
        <AlertDialog.Description size="2">
          <Text as="p" color="gray">
            {t("auth.required.body")}
          </Text>
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              {t("common.notNow")}
            </Button>
          </AlertDialog.Cancel>
          <Button asChild variant="soft">
            <Link href="/signup">{t("topbar.signUp")}</Link>
          </Button>
          <Button asChild>
            <Link href="/login">{t("topbar.signIn")}</Link>
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

export function useRequireAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // If used outside a provider (e.g. SSR fallback), assume signed in so
    // the call doesn't throw — server-side guards still catch direct URL hits.
    return () => true;
  }
  return ctx.requireAuth;
}
