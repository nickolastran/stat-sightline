"use client";

import { motion } from "framer-motion";

/*
 * Motion skeletons — a pulsing block that signals "loading, not stuck".
 * `delay` staggers a row of them so the group breathes instead of blinking
 * in unison.
 */
export function Skeleton({
  className = "",
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      aria-hidden
      className={`bg-surface-2 ${className}`}
      animate={{ opacity: [0.35, 0.75, 0.35] }}
      transition={{
        duration: 1.3,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    />
  );
}

/** Panel chrome with a placeholder heading — the shell every loading state
 *  shares, so a section fades into its real Panel rather than replacing it. */
export function SkeletonPanel({
  children,
  delay = 0,
  right = false,
}: {
  children: React.ReactNode;
  delay?: number;
  /** Reserve the header's right slot (a segmented toggle, a date stamp). */
  right?: boolean;
}) {
  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <Skeleton className="h-2.5 w-32" delay={delay} />
        {right && <Skeleton className="h-2.5 w-20" delay={delay + 0.06} />}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** Placeholder shaped like one of the stat tables: heading, header strip, rows. */
export function SkeletonTable({
  rows = 5,
  delay = 0,
  heading = true,
  avatar = false,
}: {
  rows?: number;
  delay?: number;
  heading?: boolean;
  /** Lead each row with a circle, for the lists that carry a headshot. */
  avatar?: boolean;
}) {
  return (
    <div className="border border-line bg-bg">
      {heading && (
        <div className="border-b border-line px-3 py-1.5">
          <Skeleton className="h-2.5 w-24" delay={delay} />
        </div>
      )}
      <div className="border-b border-line px-3 py-2">
        <Skeleton className="h-2.5 w-full" delay={delay + 0.05} />
      </div>
      <div className="space-y-1.5 p-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            {avatar && (
              <Skeleton
                className="h-5 w-5 shrink-0 rounded-full"
                delay={delay + i * 0.06}
              />
            )}
            <Skeleton className="h-3 flex-1" delay={delay + i * 0.06} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder row of MetricCards. */
export function SkeletonTiles({
  count = 4,
  delay = 0,
}: {
  count?: number;
  delay?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-line bg-surface p-3">
          <Skeleton className="h-2.5 w-12" delay={delay + i * 0.08} />
          <Skeleton className="mt-3 h-6 w-14" delay={delay + i * 0.08 + 0.05} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a two-team GameCard. */
export function SkeletonGameCard({ delay = 0 }: { delay?: number }) {
  return (
    <div className="border border-line bg-bg p-2">
      <Skeleton className="mb-2 h-2.5 w-16" delay={delay} />
      {[0, 1].map((r) => (
        <div key={r} className="flex items-center gap-2 py-1">
          <Skeleton className="h-5 w-5 rounded-full" delay={delay + r * 0.1} />
          <Skeleton className="h-3 flex-1" delay={delay + r * 0.1} />
          <Skeleton className="h-3 w-5" delay={delay + r * 0.1} />
        </div>
      ))}
    </div>
  );
}
