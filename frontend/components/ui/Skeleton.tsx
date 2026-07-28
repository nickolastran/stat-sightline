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
