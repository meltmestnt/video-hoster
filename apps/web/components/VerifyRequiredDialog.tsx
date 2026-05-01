"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Button, Callout, Dialog, Flex, Text } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";
import type { UnverifiedLimitKind } from "@/lib/unverified-limit";

interface ContextValue {
  show: (kind: UnverifiedLimitKind) => void;
}

const Ctx = createContext<ContextValue | null>(null);

/**
 * Wraps the app and exposes `useVerifyRequired().show("video"|"gif"|"screenshot")`
 * to any nested component. Call it whenever the API rejects an upload with
 * the UNVERIFIED_LIMIT prefix and a "verify your email" dialog will appear.
 */
export function VerifyRequiredProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [openKind, setOpenKind] = useState<UnverifiedLimitKind | null>(null);
  const t = useT();

  const show = useCallback((kind: UnverifiedLimitKind) => {
    setOpenKind(kind);
  }, []);

  const value = useMemo<ContextValue>(() => ({ show }), [show]);

  const bodyKey =
    openKind === "video"
      ? "verify.popup.body.video"
      : openKind === "gif"
        ? "verify.popup.body.gif"
        : "verify.popup.body.screenshot";

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog.Root
        open={openKind !== null}
        onOpenChange={(o) => !o && setOpenKind(null)}
      >
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>{t("verify.popup.title")}</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="3">
            {openKind ? t(bodyKey) : null}
          </Dialog.Description>
          <Callout.Root color="amber" mb="3">
            <Callout.Text>{t("verify.popup.checkInbox")}</Callout.Text>
          </Callout.Root>
          <Text as="p" size="2" color="gray" mb="4">
            {t("verify.popup.contact")}
          </Text>
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="solid" color="iris">
                {t("verify.popup.gotIt")}
              </Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Ctx.Provider>
  );
}

/**
 * Returns a stable handle for triggering the verify-required dialog.
 * Falls back to a no-op when used outside the provider so a component
 * isn't required to be wrapped before it can call `.show()`.
 */
export function useVerifyRequired(): ContextValue {
  return (
    useContext(Ctx) ?? {
      show: () => {},
    }
  );
}
