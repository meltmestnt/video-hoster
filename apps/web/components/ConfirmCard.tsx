"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Box, Heading, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

type State =
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string };

export function ConfirmCard({ token }: { token: string }) {
  const t = useT();
  const [state, setState] = useState<State>(
    token ? { kind: "loading" } : { kind: "missing" },
  );
  const confirm = trpc.auth.confirmSignUp.useMutation();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    confirm
      .mutateAsync({ token })
      .then((res) => setState({ kind: "success", email: res.email }))
      .catch((err: Error) =>
        setState({
          kind: "error",
          message: err.message || t("confirm.error.fallback"),
        }),
      );
  }, [token, confirm, t]);

  return (
    <Box
      style={{
        padding: "32px",
        background: "var(--gray-2)",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-4)",
      }}
    >
      {state.kind === "missing" && (
        <>
          <Heading size="6" mb="2">
            {t("confirm.missing.heading")}
          </Heading>
          <Text as="p" color="gray" size="2">
            {t("confirm.missing.body")}
          </Text>
        </>
      )}
      {state.kind === "loading" && (
        <>
          <Heading size="6" mb="2">
            {t("confirm.loading.heading")}
          </Heading>
          <Text as="p" color="gray" size="2">
            {t("confirm.loading.body")}
          </Text>
        </>
      )}
      {state.kind === "success" && (
        <>
          <Heading size="6" mb="2">
            {t("confirm.success.heading")}
          </Heading>
          <Text as="p" color="gray" size="2" mb="3">
            {t("confirm.success.body", { email: state.email })}
          </Text>
          <Text as="p" size="2" align="center">
            <Link href="/login" style={{ color: "var(--accent-9)" }}>
              {t("confirm.success.cta")}
            </Link>
          </Text>
        </>
      )}
      {state.kind === "error" && (
        <>
          <Heading size="6" mb="2">
            {t("confirm.error.heading")}
          </Heading>
          <Text as="p" color="red" size="2" mb="3">
            {state.message}
          </Text>
          <Text as="p" size="2" align="center">
            <Link href="/signup" style={{ color: "var(--accent-9)" }}>
              {t("confirm.error.cta")}
            </Link>
          </Text>
        </>
      )}
    </Box>
  );
}
