"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@radix-ui/themes";
import { Share1Icon, CheckIcon } from "@radix-ui/react-icons";
import { useT } from "@/lib/i18n";

interface Props {
  /** Path on this site, e.g. `/videos/abc123`. The component prefixes it with location.origin. */
  path: string;
  title: string;
  variant?: "soft" | "solid" | "outline" | "ghost";
  color?: "gray" | "iris";
  size?: "1" | "2" | "3";
}

/**
 * Share button that uses the Web Share API when available (mobile/some browsers)
 * and otherwise copies the canonical URL to the clipboard with a "Copied!" flash.
 */
export function ShareButton({
  path,
  title,
  variant = "soft",
  color = "gray",
  size = "2",
}: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const flash = () => {
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1800);
  };

  const onClick = async () => {
    if (typeof window === "undefined") return;
    const url = new URL(path, window.location.origin).toString();

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // User cancelled or share failed; fall through to clipboard copy.
        if ((err as Error).name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      flash();
    } catch {
      // Fallback for very old browsers / insecure contexts.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flash();
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      color={copied ? "green" : color}
      size={size}
      onClick={onClick}
      aria-label={t("share.button")}
    >
      {copied ? <CheckIcon /> : <Share1Icon />}
      {copied ? t("share.copied") : t("share.button")}
    </Button>
  );
}
