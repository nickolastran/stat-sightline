"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "@/components/ui/DatePicker";

/*
 * Day picker for the full scoreboard page. The day lives in the URL, not in
 * state — the slate is fetched on the server, so picking a date is a
 * navigation, which makes it linkable and streams the new day in behind the
 * section skeleton. `replace`, like the season picker, so browsing a week
 * doesn't stack seven history entries.
 */
export default function ScoreboardDate({
  value,
  today,
}: {
  value: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DatePicker
      value={value}
      today={today}
      disabled={pending}
      onSelect={(d) =>
        startTransition(() => router.replace(`?date=${d}`, { scroll: false }))
      }
    />
  );
}
