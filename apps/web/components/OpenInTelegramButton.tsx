"use client";

import { Button } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { useT } from "@/lib/i18n";
import { telegramBotUrl } from "@/lib/telegram-bot";

interface Props {
  /** Override the default soft variant when sitting next to filled buttons. */
  variant?: "solid" | "soft" | "outline" | "ghost";
  color?: "iris" | "blue" | "gray";
  size?: "1" | "2" | "3";
  /** Render an additional className for layout (e.g. `width: 100%`). */
  className?: string;
}

/**
 * One-tap shortcut to open @vidsandgifsbot in Telegram. Used in the
 * user menu, /settings, and footer so users have a discoverable path
 * to the bot without having to search Telegram (which is popularity-
 * gated for newer bots and won't surface us reliably).
 *
 * The link itself doesn't carry an account-link token — that's
 * separate (TelegramConnectRow). This is purely a "go look at the
 * bot" link, suitable for both signed-in and signed-out visitors.
 */
export function OpenInTelegramButton({
  variant = "soft",
  color = "iris",
  size = "2",
  className,
}: Props) {
  const t = useT();
  return (
    <Button asChild variant={variant} color={color} size={size}>
      <a
        href={telegramBotUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <PaperPlaneIcon /> {t("telegram.openBot")}
      </a>
    </Button>
  );
}
