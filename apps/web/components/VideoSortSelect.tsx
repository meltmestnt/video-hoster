"use client";

import { useEffect, useState, useTransition } from "react";
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
  // Eager value the user just picked. Stays set until the URL-derived
  // `value` prop catches up — at which point the listing has actually
  // re-rendered with the new sort and we drop the override. If the
  // navigation errors out, error.tsx replaces this component so there's
  // no stale optimistic state to clean up.
  const [optimistic, setOptimistic] = useState<SortValue | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (optimistic === value) setOptimistic(null);
  }, [optimistic, value]);

  // Communicate "sort change in flight" to the rest of the page via a
  // body data attribute. globals.css dims the .dashboard-grid and shows
  // a centered spinner while this is set, so every page that uses
  // VideoSortSelect gets the same loader without each owning its own.
  useEffect(() => {
    if (!isPending) return;
    document.body.dataset.sortPending = "1";
    return () => {
      delete document.body.dataset.sortPending;
    };
  }, [isPending]);

  const onChange = (next: string) => {
    const nextSort = next as SortValue;
    setOptimistic(nextSort);
    const sp = new URLSearchParams(params.toString());
    if (nextSort === "newest") sp.delete("sort");
    else sp.set("sort", nextSort);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  };

  return (
    <Select.Root value={optimistic ?? value} onValueChange={onChange}>
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
