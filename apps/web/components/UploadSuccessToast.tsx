"use client";

import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross1Icon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEffect } from "react";
import { useUpload } from "@/lib/upload-context";

const AUTO_DISMISS_MS = 6000;

export function UploadSuccessToast() {
  const { lastSuccess, dismissSuccess } = useUpload();

  useEffect(() => {
    if (!lastSuccess) return;
    const t = setTimeout(dismissSuccess, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [lastSuccess, dismissSuccess]);

  if (!lastSuccess) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1000,
        minWidth: 280,
        maxWidth: 380,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--gray-6)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        background:
          "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), linear-gradient(90deg, rgba(255,0,0,1), rgba(255,127,0,1), rgba(255,255,0,1), rgba(0,255,0,1), rgba(0,0,255,1), rgba(75,0,130,1), rgba(148,0,211,1))",
        color: "#fff",
      }}
    >
      <Flex align="start" gap="3" justify="between">
        <Box style={{ minWidth: 0 }}>
          <Text as="div" size="2" weight="bold" style={{ color: "#fff" }}>
            Upload complete
          </Text>
          <Text as="div" size="2" style={{ marginTop: 2, color: "#eee" }}>
            <Link
              href={`/videos/${lastSuccess.videoId}`}
              onClick={dismissSuccess}
              style={{ color: "#a8d4ff", textDecoration: "underline" }}
            >
              {lastSuccess.title}
            </Link>{" "}
            was uploaded.
          </Text>
        </Box>
        <IconButton
          size="1"
          variant="ghost"
          aria-label="Dismiss"
          onClick={dismissSuccess}
          style={{ color: "#fff" }}
        >
          <Cross1Icon />
        </IconButton>
      </Flex>
    </Box>
  );
}
