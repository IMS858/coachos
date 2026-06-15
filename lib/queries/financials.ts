/**
 * Financial metrics engine.
 *
 * Pulls every revenue stream into one picture:
 *   1. Membership MRR  — sum of active subscription monthly_rate_cents
 *   2. Renter rent     — sum of active renters' monthly_rent_cents
 *   3. Package revenue — two lenses:
 *        a) "earned"  = per-session value × sessions completed in the period
 *                       (recognizes revenue as you deliver it)
 *        b) "booked"  = package_total_cents for packages purchased in the period
 *                       (cash-in view)
 *
 * Monthly recurring (MRR-style) = memberships + renters. Packages are not
 * truly recurring, so they're reported separately as earned/booked, plus a
 * blended "total monthly revenue" that adds the trailing-month earned package
 * revenue on top of recurring.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TZ = "America/Los_Angeles";

function ymdInPT(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the current PT week (ISO week start). */
function startOfWeek(ymd: string): string {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0=Sun
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(ymd, -back);
}
/** First day of the current month in PT. */
function startOfMonth(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}

export interface FinancialSnapshot {
  // Recurring
  membershipMrrCents: number;
  renterRentCents: number;
  recurringMonthlyCents: number; // memberships + renters
  // Package revenue (earned = delivered)
  packageEarnedThisWeekCents: number;
  packageEarnedThisMonthCents: number;
  // Package revenue (booked = sold)
  packageBookedThisMonthCents: number;
  // Blended
  totalMonthlyRevenueCents: number; // recurring + package earned this month
  // Session activity
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  // Per-trainer session counts this month (for payouts)
  sessionsByTrainer: { trainer_id: string; name: string; count: number }[];
}

export async function getFinancialSnapshot(
  svc: SupabaseClient
): Promise<FinancialSnapshot> {
  const today = ymdInPT(new Date());
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);

  // ---- 1. Membership MRR (active subscriptions) ----
  const { data: subs } = await svc
    .from("plans")
    .select("monthly_rate_cents")
    .eq("status", "active")
    .eq("kind", "subscription");
  const membershipMrrCents = (subs ?? []).reduce(
    (s: number, r: any) => s + (r.monthly_rate_cents ?? 0),
    0
  );

  // ---- 2. Renter rent (active) ----
  let renterRentCents = 0;
  const { data: renters } = await svc
    .from("renters")
    .select("monthly_rent_cents, status")
    .eq("status", "active");
  renterRentCents = (renters ?? []).reduce(
    (s: number, r: any) => s + (r.monthly_rent_cents ?? 0),
    0
  );

  // ---- 3. Package plans for per-session value ----
  const { data: pkgs } = await svc
    .from("plans")
    .select("id, package_total_cents, total_sessions, start_date, kind, status")
    .eq("kind", "package");

  // value per session for each package
  const perSession = new Map<string, number>();
  let packageBookedThisMonthCents = 0;
  for (const p of pkgs ?? []) {
    const total = p.package_total_cents ?? 0;
    const n = p.total_sessions ?? 0;
    if (n > 0) perSession.set(p.id, Math.round(total / n));
    // booked = packages whose start_date falls in this month
    if (p.start_date && p.start_date >= monthStart && p.start_date <= today) {
      packageBookedThisMonthCents += total;
    }
  }

  // ---- Completed sessions this month (for earned revenue + counts) ----
  const monthStartIso = new Date(`${monthStart}T00:00:00-07:00`).toISOString();
  const weekStartIso = new Date(`${weekStart}T00:00:00-07:00`).toISOString();

  const { data: monthSessions } = await svc
    .from("sessions")
    .select("id, trainer_id, plan_id, scheduled_at, status, session_type")
    .gte("scheduled_at", monthStartIso)
    .in("status", ["completed"]);

  const { data: weekSessions } = await svc
    .from("sessions")
    .select("id, plan_id, status")
    .gte("scheduled_at", weekStartIso)
    .in("status", ["completed"]);

  // earned = per-session value of the linked package, summed over completed
  function earnedFrom(sessions: any[] | null): number {
    let cents = 0;
    for (const s of sessions ?? []) {
      if (s.plan_id && perSession.has(s.plan_id)) {
        cents += perSession.get(s.plan_id)!;
      }
    }
    return cents;
  }
  const packageEarnedThisMonthCents = earnedFrom(monthSessions);
  const packageEarnedThisWeekCents = earnedFrom(weekSessions);

  const sessionsThisMonth = (monthSessions ?? []).length;
  const sessionsThisWeek = (weekSessions ?? []).length;

  // ---- Per-trainer counts this month ----
  const byTrainer = new Map<string, number>();
  for (const s of monthSessions ?? []) {
    if (s.trainer_id)
      byTrainer.set(s.trainer_id, (byTrainer.get(s.trainer_id) ?? 0) + 1);
  }
  let sessionsByTrainer: FinancialSnapshot["sessionsByTrainer"] = [];
  if (byTrainer.size > 0) {
    const { data: profs } = await svc
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(byTrainer.keys()));
    const nameOf = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    sessionsByTrainer = Array.from(byTrainer.entries())
      .map(([trainer_id, count]) => ({
        trainer_id,
        name: nameOf.get(trainer_id) ?? "—",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  const recurringMonthlyCents = membershipMrrCents + renterRentCents;
  const totalMonthlyRevenueCents =
    recurringMonthlyCents + packageEarnedThisMonthCents;

  return {
    membershipMrrCents,
    renterRentCents,
    recurringMonthlyCents,
    packageEarnedThisWeekCents,
    packageEarnedThisMonthCents,
    packageBookedThisMonthCents,
    totalMonthlyRevenueCents,
    sessionsThisWeek,
    sessionsThisMonth,
    sessionsByTrainer,
  };
}
