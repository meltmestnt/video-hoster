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

export function LoginForm() {
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
      setError("Invalid email or password");
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
        Denis's videos
      </Heading>
      <Text as="p" color="gray" size="2" mb="5">
        Sign in to upload, watch, and discuss videos.
      </Text>

      <Button
        size="3"
        style={{ width: "100%" }}
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        Continue with Google
      </Button>

      <Flex align="center" gap="3" my="4">
        <Separator size="4" style={{ flex: 1 }} />
        <Text size="1" color="gray">
          OR
        </Text>
        <Separator size="4" style={{ flex: 1 }} />
      </Flex>

      <form onSubmit={submit}>
        <Flex direction="column" gap="3">
          <Box>
            <Text as="div" size="2" weight="medium" mb="1">
              Email
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
              Password
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
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </Flex>
      </form>

      <Text as="p" size="2" color="gray" mt="4" align="center">
        New here?{" "}
        <Link href="/signup" style={{ color: "var(--accent-9)" }}>
          Create an account
        </Link>
      </Text>
    </Box>
  );
}
