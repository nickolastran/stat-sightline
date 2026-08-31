"use client";

import SegmentedControl from "@/components/ui/SegmentedControl";
import { useSetParam } from "@/lib/useSetParam";

/*
 * A segmented toggle that writes one query parameter — the tab strip over a
 * view whose sections are each their own server-rendered payload. Same trade
 * as ParamSelect, in the shape a handful of sections reads better as.
 */
export default function ParamTabs({
  param,
  value,
  options,
  ariaLabel,
  size,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  size?: "sm" | "lg";
}) {
  const setParam = useSetParam();
  return (
    <SegmentedControl<string>
      ariaLabel={ariaLabel}
      size={size}
      value={value}
      onChange={(v) => setParam(param, v)}
      options={options}
    />
  );
}
