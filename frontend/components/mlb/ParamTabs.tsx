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
  variant,
  className,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  size?: "sm" | "lg";
  variant?: "box" | "underline";
  className?: string;
}) {
  const setParam = useSetParam();
  return (
    <SegmentedControl<string>
      ariaLabel={ariaLabel}
      size={size}
      variant={variant}
      className={className}
      value={value}
      onChange={(v) => setParam(param, v)}
      options={options}
    />
  );
}
