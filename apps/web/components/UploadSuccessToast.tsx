"use client";

import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross1Icon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEffect } from "react";
import { useUpload } from "@/lib/upload-context";
import { useT } from "@/lib/i18n";

const AUTO_DISMISS_MS = 6000;

export function UploadSuccessToast() {
  const { lastSuccess, dismissSuccess } = useUpload();
  const t = useT();

  useEffect(() => {
    if (!lastSuccess) return;
    const handle = setTimeout(dismissSuccess, AUTO_DISMISS_MS);
    return () => clearTimeout(handle);
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
        border: "1px solid var(--crimson-6)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        background: "var(--crimson-3)",
        color: "var(--crimson-12)",
      }}
    >
      <Flex align="start" gap="3" justify="between">
        <Box style={{ minWidth: 0 }}>
          <Text
            as="div"
            size="2"
            weight="bold"
            style={{ color: "var(--crimson-12)" }}
          >
            {t("upload.success.heading")}
          </Text>
          <Text
            as="div"
            size="2"
            style={{ marginTop: 2, color: "var(--crimson-11)" }}
          >
            <Link
              href={`/videos/${lastSuccess.videoId}`}
              onClick={dismissSuccess}
              style={{ color: "var(--crimson-12)", textDecoration: "underline" }}
            >
              {lastSuccess.title}
            </Link>
            {t("upload.success.suffix")}
          </Text>
        </Box>
        <IconButton
          size="1"
          variant="ghost"
          aria-label={t("upload.success.dismiss")}
          onClick={dismissSuccess}
          style={{ color: "var(--crimson-11)" }}
        >
          <Cross1Icon />
        </IconButton>
      </Flex>
    </Box>
  );
}
