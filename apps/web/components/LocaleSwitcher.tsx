"use client";

import { SegmentedControl } from "@radix-ui/themes";
import { useLocale, useSetLocale } from "@/lib/i18n";

// Small EN/UK toggle. The i18n provider already persists every change to
// localStorage (key `vh.locale`) and reflects it on <html lang>, so this
// component only needs to wire the buttons to setLocale.
export function LocaleSwitcher({
  size = "1",
}: {
  size?: "1" | "2" | "3";
}) {
  const locale = useLocale();
  const setLocale = useSetLocale();

  return (
    <SegmentedControl.Root
      size={size}
      value={locale}
      onValueChange={(v) => setLocale(v === "uk" ? "uk" : "en")}
      aria-label="Language"
    >
      <SegmentedControl.Item value="en">EN</SegmentedControl.Item>
      <SegmentedControl.Item value="uk">UK</SegmentedControl.Item>
    </SegmentedControl.Root>
  );
}
