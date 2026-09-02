"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Keeps a live game page current. The panels are server-rendered off requests
 * that revalidate every fifteen seconds, so re-asking the server on a timer is
 * the whole of it — no client fetching, no second copy of the parsing.
 */
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
