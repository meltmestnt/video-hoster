"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import {
  ALLOWED_AVATAR_MIME_TYPES,
  MAX_AVATAR_BYTES,
  type AllowedAvatarMimeType,
} from "@repo/shared";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  onPick: (file: File) => void;
  onBack: () => void;
}

const isAllowed = (type: string): type is AllowedAvatarMimeType =>
  (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(type);

export function AvatarUploadPane({ onPick, onBack }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!isAllowed(file.type)) {
      setError(t("avatar.errorWrongType"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(
        t("avatar.errorTooLarge", {
          mb: (MAX_AVATAR_BYTES / 1024 / 1024).toFixed(0),
        }),
      );
      return;
    }
    setError(null);
    onPick(file);
  };

  return (
    <Flex direction="column" gap="3" style={{ width: 280 }}>
      <Text size="2" weight="medium">
        {t("avatar.pickNew")}
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
          {t("avatar.dropHere")}
        </Text>
        <Text size="1" color="gray">
          {t("avatar.browseHint", {
            mb: Math.round(MAX_AVATAR_BYTES / 1024 / 1024),
          })}
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
          {t("common.cancel")}
        </Button>
      </Flex>
    </Flex>
  );
}
