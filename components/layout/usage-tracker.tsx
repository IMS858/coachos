"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Records a page view per route change.
 *
 * Throttled to one event per path per 60s so a client flipping between tabs
 * doesn't inflate their own numbers — the dashboard should reflect real visits.
 * keepalive lets the request survive the navigation that triggered it.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const seen = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    const last = seen.current.get(pathname) ?? 0;
    if (now - last < 60_000) return;
    seen.current.set(pathname, now);

    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "view", path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
