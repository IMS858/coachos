import { createServiceClient } from "@/lib/supabase/server";

export type LowBalanceClient = {
  clientId: string;
  name: string;
  planLabel: string;
  remaining: number;
  total: number;
  state: "low" | "depleted";
  expiresAt: string | null;
};

const TIER_LABEL: Record<string, string> = {
  package_6: "6-Session Package",
  package_12: "12-Session Package",
  package_24: "24-Session Package",
  custom: "Custom Plan",
};

/**
 * Find every active package at or below `threshold` sessions remaining.
 * Used by both the dashboard Low Balance card and the daily cron scan.
 * Uses the service client so it works from cron (no user session).
 */
export async function findLowBalancePackages(
  threshold = 2
): Promise<LowBalanceClient[]> {
  const svc = createServiceClient();

  const { data: plans } = await svc
    .from("plans")
    .select(
      "client_id, tier, custom_label, total_sessions, sessions_used, expires_at"
    )
    .eq("status", "active")
    .eq("kind", "package");

  if (!plans || plans.length === 0) return [];

  const low = plans
    .map((p) => {
      const total = p.total_sessions ?? 0;
      const used = p.sessions_used ?? 0;
      const remaining = Math.max(total - used, 0);
      return { p, total, remaining };
    })
    .filter((x) => x.remaining <= threshold);

  if (low.length === 0) return [];

  // Resolve names
  const ids = Array.from(new Set(low.map((x) => x.p.client_id)));
  const { data: profs } = await svc
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const names = Object.fromEntries(
    (profs ?? []).map((n) => [n.id, n.full_name])
  );

  return low
    .map((x) => ({
      clientId: x.p.client_id,
      name: names[x.p.client_id] ?? "Client",
      planLabel:
        x.p.custom_label || TIER_LABEL[x.p.tier] || "Session Package",
      remaining: x.remaining,
      total: x.total,
      state: (x.remaining === 0 ? "depleted" : "low") as "low" | "depleted",
      expiresAt: x.p.expires_at,
    }))
    .sort((a, b) => a.remaining - b.remaining);
}
