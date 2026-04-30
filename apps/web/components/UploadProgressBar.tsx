"use client";

import { Box, Flex, Text } from "@radix-ui/themes";
import { useUpload, isUploadBusy } from "@/lib/upload-context";

export function UploadProgressBar() {
  const upload = useUpload();
  if (!isUploadBusy(upload.status) && upload.status !== "error") return null;

  if (upload.status === "error") {
    return (
      <Box style={{ padding: "8px 16px", background: "var(--red-3)" }}>
        <Text size="2" color="red">
          Upload failed: {upload.errorMessage ?? "unknown error"}
        </Text>
      </Box>
    );
  }

  const pct = Math.round(upload.progress * 100);
  const label =
    upload.status === "compressing"
      ? `Compressing ${upload.fileName ?? ""} ${pct}%`
      : upload.status === "preparing"
        ? "Preparing..."
        : upload.status === "finalizing"
          ? "Finalizing (generating thumbnail)..."
          : `Uploading ${upload.fileName ?? ""} ${pct}%`;

  return (
    <Box style={{ padding: "0 16px" }}>
      <Flex direction="column" gap="1" py="2">
        <Text size="1" color="gray">
          {label}
        </Text>
        <Box
          style={{
            height: 4,
            width: "100%",
            background: "var(--gray-4)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <Box
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "var(--iris-9)",
              transition: "width 120ms linear",
            }}
          />
        </Box>
      </Flex>
    </Box>
  );
}
