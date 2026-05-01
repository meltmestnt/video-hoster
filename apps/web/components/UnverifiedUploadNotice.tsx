"use client";

import { useState } from "react";
import { Button, Callout, Flex, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

/**
 * Inline yellow callout shown at the top of the upload dialogs when the
 * signed-in user hasn't confirmed their email. Replaces the previous
 * "disable everything" UX with explicit messaging + a one-click resend.
 *
 * Renders nothing for verified users / signed-out viewers / while the
 * auth.me query is loading, so the dialog body looks normal in all
 * those cases.
 */
export function UnverifiedUploadNotice() {
  const t = useT();
  const me = trpc.auth.me.useQuery();
  const resend = trpc.auth.resendConfirmation.useMutation();
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [errMessage, setErrMessage] = useState<string | null>(null);

  if (!me.data || me.data.status === "verified") return null;

  const tryResend = async () => {
    setStatus("idle");
    setErrMessage(null);
    try {
      const r = await resend.mutateAsync({ email: me.data!.email });
      setStatus(r.mailSent ? "ok" : "err");
    } catch (err) {
      setStatus("err");
      // Surface the rate-limit message verbatim — it tells the user "try
      // again in N hours" which is more useful than a generic failure.
      setErrMessage((err as Error).message ?? null);
    }
  };

  return (
    <Callout.Root color="amber" mb="3">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>
        <Flex direction="column" gap="2">
          <Text>{t("unverified.upload.notice")}</Text>
          <Flex align="center" gap="2" wrap="wrap">
            <Button
              size="1"
              variant="soft"
              color="amber"
              onClick={tryResend}
              disabled={resend.isPending}
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
        </Flex>
      </Callout.Text>
    </Callout.Root>
  );
}
