"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@radix-ui/themes";
import { useT } from "@/lib/i18n";

type SortValue = "newest" | "mostLiked" | "mostDisliked";

const OPTIONS: Array<{
  value: SortValue;
  labelKey: "sort.newest" | "sort.mostLiked" | "sort.mostDisliked";
}> = [
  { value: "newest", labelKey: "sort.newest" },
  { value: "mostLiked", labelKey: "sort.mostLiked" },
  { value: "mostDisliked", labelKey: "sort.mostDisliked" },
];

export function VideoSortSelect({ value }: { value: SortValue }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT();

  const onChange = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "newest") sp.delete("sort");
    else sp.set("sort", next);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger aria-label={t("sort.aria.videos")} />
      <Select.Content>
        {OPTIONS.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {t(o.labelKey)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
