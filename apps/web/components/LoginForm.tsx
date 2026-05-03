"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Separator,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useT } from "@/lib/i18n";

export function LoginForm() {
  const t = useT();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    });
    setPending(false);
    if (!res || res.error) {
      // Always show the generic invalid-credentials message regardless of
      // why authorize() rejected. The previous flow probed a ban-status
      // endpoint to render a more helpful "your account is banned"
      // message, but that endpoint also let unauthenticated visitors
      // enumerate which emails were registered. Banned users now see the
      // same text as anyone with bad credentials — they can email support
      // if they want a real explanation.
      setError(t("auth.login.invalid"));
      return;
    }
    window.location.href = res.url ?? "/";
  };

  return (
    <Box
      style={{
        padding: "32px",
        background: "var(--gray-2)",
        borderRadius: "var(--radius-4)",
        border: "1px solid var(--gray-4)",
      }}
    >
      <Heading size="6" mb="2">
        {t("auth.login.title")}
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        {t("auth.login.subtitle")}
      </Text>

      <Button
        size="3"
        style={{ width: "100%" }}
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        {t("auth.login.continueGoogle")}
      </Button>

      <Flex align="center" gap="3" my="4">
        <Separator size="4" style={{ flex: 1 }} />
        <Text size="1" color="gray">
          {t("common.or")}
        </Text>
        <Separator size="4" style={{ flex: 1 }} />
      </Flex>

      <form onSubmit={submit}>
        <Flex direction="column" gap="3">
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              {t("auth.login.email")}
            </Text>
            <TextField.Root
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Box>
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              {t("auth.login.password")}
            </Text>
            <TextField.Root
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Box>
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
          <Button
            size="3"
            type="submit"
            disabled={pending}
            variant="soft"
          >
            {pending ? t("auth.login.signingIn") : t("auth.login.signInButton")}
          </Button>
        </Flex>
      </form>

      <Text as="p" size="2" color="gray" mt="4" align="center">
        {t("auth.login.newHere")}{" "}
        <Link href="/signup" style={{ color: "var(--accent-9)" }}>
          {t("auth.login.createAccount")}
        </Link>
      </Text>
    </Box>
  );
}
