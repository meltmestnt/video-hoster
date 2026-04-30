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

export function SignUpForm() {
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
        setError(
          "Account created, but auto sign-in failed. Try signing in manually.",
        );
        return;
      }
      window.location.href = res.url ?? "/";
    } catch (err) {
      const msg = (err as Error).message ?? "Sign-up failed";
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
          Check your email
        </Heading>
        <Text as="p" color="gray" size="2" mb="3">
          We sent a confirmation link to <strong>{pendingEmail}</strong>. Click
          the link to activate your account, then sign in.
        </Text>
        <Text as="p" size="2" color="gray">
          The link expires in 24 hours.
        </Text>
        <Text as="p" size="2" color="gray" mt="4" align="center">
          <Link href="/login" style={{ color: "var(--accent-9)" }}>
            Back to sign in
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
        Create account
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        Sign up with email and password.
      </Text>
      <form onSubmit={submit}>
        <Flex direction="column" gap="3">
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              Name
            </Text>
            <TextField.Root
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </Box>
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              Email
            </Text>
            <TextField.Root
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailTaken) setEmailTaken(null);
              }}
              placeholder="you@example.com"
            />
          </Box>
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              Password
            </Text>
            <TextField.Root
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
                An account with <strong>{emailTaken}</strong> already exists.
              </Text>
              <Link
                href={`/login?email=${encodeURIComponent(emailTaken)}`}
                style={{ color: "var(--accent-9)", fontWeight: 500 }}
              >
                Sign in instead →
              </Link>
            </Box>
          )}
          {error && (
            <Text color="red" size="2">
              {error}
            </Text>
          )}
          <Button size="3" type="submit" disabled={pending || !!emailTaken}>
            {pending ? "Creating account..." : "Sign up"}
          </Button>
        </Flex>
      </form>
      <Text as="p" size="2" color="gray" mt="4" align="center">
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent-9)" }}>
          Sign in
        </Link>
      </Text>
    </Box>
  );
}
