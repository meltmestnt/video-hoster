"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@radix-ui/themes";

const OPTIONS: Array<{ value: "newest" | "mostLiked" | "mostDisliked"; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "mostLiked", label: "Most liked" },
  { value: "mostDisliked", label: "Most disliked" },
];

export function VideoSortSelect({
  value,
}: {
  value: "newest" | "mostLiked" | "mostDisliked";
}) {
  const router = useRouter();
  const params = useSearchParams();

  const onChange = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "newest") sp.delete("sort");
    else sp.set("sort", next);
    const qs = sp.toString();
    router.push(qs ? `?${qs}` : "?");
  };

  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger aria-label="Sort videos" />
      <Select.Content>
        {OPTIONS.map((o) => (
          <Select.Item key={o.value} value={o.value}>
            {o.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
