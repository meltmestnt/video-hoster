"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button, Callout, Dialog, Flex, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import type { UnverifiedLimitKind } from "@/lib/unverified-limit";

type GateReason = "unverified" | "unapproved" | "unapproved-size";

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
    open?.reason === "unapproved-size"
      ? "unapproved.size.title"
      : open?.reason === "unapproved"
        ? "unapproved.popup.title"
        : open?.kind === "action"
          ? "verify.popup.title.action"
          : "verify.popup.title";
  const bodyKey = !open
    ? null
    : open.reason === "unapproved-size"
      ? open.kind === "video"
        ? "unapproved.size.body.video"
        : "unapproved.size.body.gif"
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
            : open.kind === "screenshot"
              ? "verify.popup.body.screenshot"
              : "verify.popup.body.action";
  const dismissKey =
    open?.reason === "unapproved" || open?.reason === "unapproved-size"
      ? "unapproved.popup.gotIt"
      : "verify.popup.gotIt";

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
              <ResendRow open={open !== null} />
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
 * Inline "Resend confirmation" row inside the dialog. Mirrors the resend
 * UX from UnverifiedUploadNotice — same mutation, same rate limit (2/24h
 * per IP, enforced server-side), same status messages. Reset whenever
 * the dialog opens so a previous "sent" state doesn't leak.
 */
function ResendRow({ open }: { open: boolean }) {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const resend = trpc.auth.resendConfirmation.useMutation();
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [errMessage, setErrMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setErrMessage(null);
    }
  }, [open]);

  const tryResend = async () => {
    setStatus("idle");
    setErrMessage(null);
    if (!me.data?.email) {
      setStatus("err");
      return;
    }
    try {
      const r = await resend.mutateAsync({ email: me.data.email });
      setStatus(r.mailSent ? "ok" : "err");
    } catch (err) {
      setStatus("err");
      setErrMessage((err as Error).message ?? null);
    }
  };

  return (
    <Flex align="center" gap="2" wrap="wrap" mb="3">
      <Button
        size="1"
        variant="soft"
        color="amber"
        onClick={tryResend}
        disabled={resend.isPending || !me.data}
      >
        {resend.isPending
          ? t("auth.signup.resending")
          : t("auth.signup.resend")}
      </Button>
      {status === "ok" && (
        <Text size="1" color="green">
          {t("auth.signup.resendOk")}
        </Text>
      )}
      {status === "err" && (
        <Text size="1" color="red">
          {errMessage ?? t("auth.signup.resendErr")}
        </Text>
      )}
    </Flex>
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
