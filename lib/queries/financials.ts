/** Operational plan-value estimates, NOT proof of collected cash or amounts owed. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ptWallClockToUtc } from "../recurring";
import { pacificDate, addCalendarDays } from "../time/pacific";

export interface FinancialSnapshot {
  membershipMrrCents: number;
  renterRentCents: number;
  recurringMonthlyCents: number;
  packageEarnedThisWeekCents: number;
  packageEarnedThisMonthCents: number;
  packageBookedThisMonthCents: number;
  totalMonthlyRevenueCents: number;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  sessionsByTrainer: { trainer_id: string; name: string; count: number }[];
}
interface PlanRow {
  id: string; kind: string; status: string; monthly_rate_cents: number | null;
  package_total_cents: number | null; total_sessions: number | null; start_date: string | null;
}
interface SessionRow { id: string; trainer_id: string | null; plan_id: string | null; scheduled_at: string }

// PostgREST can cap returned rows. Page explicitly rather than silently calling
// the first page an entire studio total. Fail the snapshot if any page fails.
async function readPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>): Promise<T[]> {
  const all: T[] = [];
  const size = 500;
  for (let from = 0; from < 50_000; from += size) {
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error || !data) throw new Error("Financial source unavailable");
    all.push(...data);
    if (data.length < size) return all;
  }
  throw new Error("Financial snapshot exceeds review limit");
}

export async function getFinancialSnapshot(svc: SupabaseClient, now = new Date()): Promise<FinancialSnapshot> {
  const today = pacificDate(now);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const weekStart = addCalendarDays(today, -((day + 6) % 7)); // retain Monday-based finance week
  const monthStart = `${today.slice(0, 8)}01`;
  const monthStartIso = ptWallClockToUtc(monthStart, "00:00").toISOString();
  const weekStartIso = ptWallClockToUtc(weekStart, "00:00").toISOString();
  const [plans, renters, sessions] = await Promise.all([
    readPages<PlanRow>((from, to) => svc.from("plans")
      .select("id, kind, status, monthly_rate_cents, package_total_cents, total_sessions, start_date")
      .order("id").range(from, to)),
    readPages<{ id: string; monthly_rent_cents: number | null }>((from, to) => svc.from("renters")
      .select("id, monthly_rent_cents").eq("status", "active").order("id").range(from, to)),
    readPages<SessionRow>((from, to) => svc.from("sessions")
      .select("id, trainer_id, plan_id, scheduled_at").eq("status", "completed")
      .gte("scheduled_at", monthStartIso < weekStartIso ? monthStartIso : weekStartIso)
      .lte("scheduled_at", now.toISOString()).order("id").range(from, to)),
  ]);
  const membershipMrrCents = plans.filter((plan) => plan.kind === "subscription" && plan.status === "active")
    .reduce((sum, plan) => sum + (plan.monthly_rate_cents ?? 0), 0);
  const renterRentCents = renters.reduce((sum, renter) => sum + (renter.monthly_rent_cents ?? 0), 0);
  const perSession = new Map<string, number>();
  let packageBookedThisMonthCents = 0;
  for (const plan of plans.filter((item) => item.kind === "package")) {
    if ((plan.total_sessions ?? 0) > 0) perSession.set(plan.id, Math.round((plan.package_total_cents ?? 0) / plan.total_sessions!));
    if (plan.start_date && plan.start_date >= monthStart && plan.start_date <= today) packageBookedThisMonthCents += plan.package_total_cents ?? 0;
  }
  const monthSessions = sessions.filter((session) => new Date(session.scheduled_at).getTime() >= Date.parse(monthStartIso));
  const weekSessions = sessions.filter((session) => new Date(session.scheduled_at).getTime() >= Date.parse(weekStartIso));
  const earned = (rows: SessionRow[]) => rows.reduce((sum, session) => sum + (session.plan_id ? perSession.get(session.plan_id) ?? 0 : 0), 0);
  const byTrainer = new Map<string, number>();
  for (const session of monthSessions) {
    if (session.trainer_id) byTrainer.set(session.trainer_id, (byTrainer.get(session.trainer_id) ?? 0) + 1);
  }
  let profiles: { id: string; full_name: string }[] = [];
  if (byTrainer.size > 0) {
    profiles = await readPages<{ id: string; full_name: string }>((from, to) => svc.from("profiles")
      .select("id, full_name").in("id", [...byTrainer.keys()]).order("id").range(from, to));
  }
  const nameOf = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  const recurringMonthlyCents = membershipMrrCents + renterRentCents;
  const packageEarnedThisMonthCents = earned(monthSessions);
  return {
    membershipMrrCents, renterRentCents, recurringMonthlyCents,
    packageEarnedThisWeekCents: earned(weekSessions), packageEarnedThisMonthCents,
    packageBookedThisMonthCents, totalMonthlyRevenueCents: recurringMonthlyCents + packageEarnedThisMonthCents,
    sessionsThisWeek: weekSessions.length, sessionsThisMonth: monthSessions.length,
    sessionsByTrainer: [...byTrainer].map(([trainer_id, count]) => ({ trainer_id, count, name: nameOf.get(trainer_id) ?? "Trainer unavailable" })).sort((a, b) => b.count - a.count),
  };
}
