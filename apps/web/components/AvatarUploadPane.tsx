"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
  type AllowedAvatarMimeType,
} from "@repo/shared";
import { useRef, useState } from "react";

interface Props {
  onPick: (file: File) => void;
  onBack: () => void;
}

const isAllowed = (type: string): type is AllowedAvatarMimeType =>
  (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(type);

export function AvatarUploadPane({ onPick, onBack }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!isAllowed(file.type)) {
      setError("Please pick a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(
        `Image is too large. Max ${(MAX_AVATAR_BYTES / 1024 / 1024).toFixed(0)} MB.`,
      );
      return;
    }
    setError(null);
    onPick(file);
  };

  return (
    <Flex direction="column" gap="3" style={{ width: 280 }}>
      <Text size="2" weight="medium">
        Pick a new avatar
      </Text>

      <div
        className="avatar-drop-zone"
        data-active={dragActive ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <Text size="2" weight="medium">
          Drop an image here
        </Text>
        <Text size="1" color="gray">
          or click to browse — JPEG, PNG, WebP up to{" "}
          {Math.round(MAX_AVATAR_BYTES / 1024 / 1024)} MB
        </Text>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_AVATAR_MIME_TYPES.join(",")}
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}

      <Flex justify="end">
        <Button variant="soft" color="gray" onClick={onBack}>
          Cancel
        </Button>
      </Flex>
    </Flex>
  );
}
