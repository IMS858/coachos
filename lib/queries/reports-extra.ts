import type { SupabaseClient } from "@supabase/supabase-js";

/** Client retention snapshot: active vs churned, by status. */
export async function getRetentionSnapshot(svc: SupabaseClient) {
  const { data: clients } = await svc
    .from("clients")
    .select("id, status, joined_at");

  const all = clients ?? [];
  const byStatus = new Map<string, number>();
  for (const c of all) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  }

  const active = byStatus.get("active") ?? 0;
  const churned = (byStatus.get("churned") ?? 0) + (byStatus.get("cancelled") ?? 0);
  const paused = byStatus.get("paused") ?? 0;
  const total = active + churned + paused;
  const retentionRate = total > 0 ? Math.round((active / total) * 100) : 0;

  // New clients in the last 30 / 90 days
  const now = Date.now();
  const d30 = now - 30 * 86400000;
  const d90 = now - 90 * 86400000;
  let new30 = 0;
  let new90 = 0;
  for (const c of all) {
    if (!c.joined_at) continue;
    const t = new Date(c.joined_at).getTime();
    if (t >= d30) new30++;
    if (t >= d90) new90++;
  }

  return {
    statusBreakdown: Array.from(byStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    active,
    churned,
    paused,
    retentionRate,
    new30,
    new90,
    totalClients: all.length,
  };
}

/** Payments summary for a tax/accounting view — by month, by source. */
export async function getPaymentsSummary(svc: SupabaseClient, year: number) {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const { data: payments } = await svc
    .from("payments")
    .select("amount_cents, status, source, paid_at")
    .gte("paid_at", start)
    .lt("paid_at", end)
    .eq("status", "succeeded");

  const rows = payments ?? [];
  const byMonth = new Array(12).fill(0);
  const bySource = new Map<string, number>();
  let total = 0;

  for (const p of rows) {
    if (!p.paid_at) continue;
    const m = new Date(p.paid_at).getMonth();
    byMonth[m] += p.amount_cents;
    bySource.set(p.source, (bySource.get(p.source) ?? 0) + p.amount_cents);
    total += p.amount_cents;
  }

  return {
    year,
    totalCents: total,
    byMonthCents: byMonth,
    bySource: Array.from(bySource.entries()).map(([source, cents]) => ({ source, cents })),
    paymentCount: rows.length,
  };
}
