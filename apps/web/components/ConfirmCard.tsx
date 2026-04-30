"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Box, Heading, Text } from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";

type State =
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string };

export function ConfirmCard({ token }: { token: string }) {
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
          message: err.message || "Could not confirm your account.",
        }),
      );
  }, [token, confirm]);

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
            Missing token
          </Heading>
          <Text as="p" color="gray" size="2">
            This confirmation link is incomplete. Please use the link from the
            email we sent you.
          </Text>
        </>
      )}
      {state.kind === "loading" && (
        <>
          <Heading size="6" mb="2">
            Confirming…
          </Heading>
          <Text as="p" color="gray" size="2">
            Hold on while we verify your account.
          </Text>
        </>
      )}
      {state.kind === "success" && (
        <>
          <Heading size="6" mb="2">
            Account verified
          </Heading>
          <Text as="p" color="gray" size="2" mb="3">
            <strong>{state.email}</strong> is ready to sign in.
          </Text>
          <Text as="p" size="2" align="center">
            <Link href="/login" style={{ color: "var(--accent-9)" }}>
              Continue to sign in
            </Link>
          </Text>
        </>
      )}
      {state.kind === "error" && (
        <>
          <Heading size="6" mb="2">
            Confirmation failed
          </Heading>
          <Text as="p" color="red" size="2" mb="3">
            {state.message}
          </Text>
          <Text as="p" size="2" align="center">
            <Link href="/signup" style={{ color: "var(--accent-9)" }}>
              Sign up again
            </Link>
          </Text>
        </>
      )}
    </Box>
  );
}
