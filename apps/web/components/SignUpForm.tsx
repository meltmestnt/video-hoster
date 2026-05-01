"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";

export function SignUpForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const signUp = trpc.auth.signUp.useMutation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailTaken(null);
    setPending(true);
    try {
      const result = await signUp.mutateAsync({ email, name, password });
      if (result.status === "pending") {
        setPendingEmail(result.email);
        return;
      }
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/",
      });
      if (!res || res.error) {
        setError(t("auth.signup.autoFail"));
        return;
      }
      window.location.href = res.url ?? "/";
    } catch (err) {
      const msg = (err as Error).message ?? t("auth.signup.failed");
      if (/already exists/i.test(msg)) {
        setEmailTaken(email);
      } else {
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  };

  if (pendingEmail) {
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
          {t("auth.signup.checkEmailHeading")}
        </Heading>
        <Text as="p" color="gray" size="2" mb="3">
          {t("auth.signup.checkEmailBody", { email: pendingEmail })}
        </Text>
        <Text as="p" size="2" color="gray">
          {t("auth.signup.linkExpires")}
        </Text>
        <Text as="p" size="2" color="gray" mt="4" align="center">
          <Link href="/login" style={{ color: "var(--accent-9)" }}>
            {t("auth.signup.backToSignIn")}
          </Link>
        </Text>
      </Box>
    );
  }

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
        {t("auth.signup.heading")}
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        {t("auth.signup.subtitle")}
      </Text>
      <form onSubmit={submit}>
        <Flex direction="column" gap="3">
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              {t("auth.signup.name")}
            </Text>
            <TextField.Root
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.signup.namePlaceholder")}
            />
          </Box>
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              {t("auth.signup.email")}
            </Text>
            <TextField.Root
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailTaken) setEmailTaken(null);
              }}
              placeholder={t("auth.signup.emailPlaceholder")}
            />
          </Box>
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              {t("auth.signup.password")}
            </Text>
            <TextField.Root
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.signup.passwordPlaceholder")}
            />
          </Box>
          {emailTaken && (
            <Box
              style={{
                padding: "12px 14px",
                background: "var(--accent-3)",
                border: "1px solid var(--accent-6)",
                borderRadius: "var(--radius-3)",
              }}
            >
              <Text as="div" size="2" mb="2">
                {t("auth.signup.takenLine", { email: emailTaken })}
              </Text>
              <Link
                href={`/login?email=${encodeURIComponent(emailTaken)}`}
                style={{ color: "var(--accent-9)", fontWeight: 500 }}
              >
                {t("auth.signup.signInInstead")}
              </Link>
            </Box>
          )}
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
          <Button size="3" type="submit" disabled={pending || !!emailTaken}>
            {pending ? t("auth.signup.creating") : t("auth.signup.submit")}
          </Button>
        </Flex>
      </form>
      <Text as="p" size="2" color="gray" mt="4" align="center">
        {t("auth.signup.alreadyHave")}{" "}
        <Link href="/login" style={{ color: "var(--accent-9)" }}>
          {t("auth.signup.signInLink")}
        </Link>
      </Text>
    </Box>
  );
}
