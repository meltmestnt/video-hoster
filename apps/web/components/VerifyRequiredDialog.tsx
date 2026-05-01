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

type GateReason = "unverified" | "unapproved";

interface OpenState {
  kind: UnverifiedLimitKind;
  reason: GateReason;
}

interface ContextValue {
  /** Opens the dialog. `reason` defaults to "unverified" for back-compat. */
  show: (kind: UnverifiedLimitKind, reason?: GateReason) => void;
}

const Ctx = createContext<ContextValue | null>(null);

/**
 * Wraps the app and exposes `useVerifyRequired().show("video"|"gif"|"screenshot",
 * "unverified" | "unapproved")` to any nested component. Call it whenever the
 * API rejects an upload with one of the gate-specific error prefixes and the
 * dialog will appear with the right copy for the gate that fired.
 */
export function VerifyRequiredProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const t = useT();

  const show = useCallback(
    (kind: UnverifiedLimitKind, reason: GateReason = "unverified") => {
      setOpen({ kind, reason });
    },
    [],
  );

  const value = useMemo<ContextValue>(() => ({ show }), [show]);

  const titleKey =
    open?.reason === "unapproved" ? "unapproved.popup.title" : "verify.popup.title";
  const bodyKey = !open
    ? null
    : open.reason === "unapproved"
      ? open.kind === "video"
        ? "unapproved.popup.body.video"
        : open.kind === "gif"
          ? "unapproved.popup.body.gif"
          : "unapproved.popup.body.screenshot"
      : open.kind === "video"
        ? "verify.popup.body.video"
        : open.kind === "gif"
          ? "verify.popup.body.gif"
          : "verify.popup.body.screenshot";
  const dismissKey =
    open?.reason === "unapproved" ? "unapproved.popup.gotIt" : "verify.popup.gotIt";

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog.Root
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
      >
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>{t(titleKey)}</Dialog.Title>
          <Dialog.Description size="2" color="gray" mb="3">
            {bodyKey ? t(bodyKey) : null}
          </Dialog.Description>
          {open?.reason === "unverified" && (
            <>
              <Callout.Root color="amber" mb="3">
                <Callout.Text>{t("verify.popup.checkInbox")}</Callout.Text>
              </Callout.Root>
              <Text as="p" size="2" color="gray" mb="4">
                {t("verify.popup.contact")}
              </Text>
            </>
          )}
          <Flex gap="3" justify="end">
            <Dialog.Close>
              <Button variant="solid" color="iris">
                {t(dismissKey)}
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
