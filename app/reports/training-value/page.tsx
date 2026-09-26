import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { readCompleteEvidence } from "@/lib/migration/complete-read";
import { analyzeTrainingValue, trainingValueTotals, type TrainingValueDecision } from "@/lib/migration/historical-value";

export const dynamic = "force-dynamic";
type SessionRow = { id: string; client_id: string; trainer_id: string | null; scheduled_at: string; duration_minutes: number | null; session_type: string; status: string };
const dollars = (value: number | null) => value === null ? "Not established" : new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0}).format(value / 100);
const period = new Intl.DateTimeFormat("en-US", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit"});
function monthKey(value: string) {
  const parts = period.formatToParts(new Date(value));
  return parts.find(part => part.type === "year")!.value + "-" + parts.find(part => part.type === "month")!.value;
}
function groups(rows: TrainingValueDecision[], key: (row: TrainingValueDecision) => string) {
  const result = new Map<string, TrainingValueDecision[]>();
  for (const row of rows) { const id = key(row); result.set(id, [...(result.get(id) ?? []), row]); }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([id, items]) => ({id, ...trainingValueTotals(items)}));
}

export default async function TrainingValuePage() {
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!user) redirect("/login?next=/reports/training-value");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) throw new Error("Owner authorization is unavailable.");
  if (!me.data || me.data.deleted_at || me.data.role !== "owner") redirect("/dashboard");
  const observed = new Date();
  const from = new Date(observed.getTime() - 90 * 86400000).toISOString();
  const until = new Date(observed.getTime() + 60 * 86400000).toISOString();
  let evidence: SessionRow[] = [];
  const names = new Map<string, string>();
  let failure: string | null = null;
  try {
    evidence = await readCompleteEvidence<SessionRow>((start, end) => db.from("sessions")
      .select("id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,status", {count: "exact"})
      .gte("scheduled_at", from).lt("scheduled_at", until).order("id").range(start, end));
    const identities = [...new Set(evidence.flatMap(row => [row.client_id, row.trainer_id].filter((id): id is string => Boolean(id))))];
    for (let index = 0; index < identities.length; index += 100) {
      const people = await readCompleteEvidence<{id: string; full_name: string}>((start, end) => db.from("profiles")
        .select("id,full_name", {count: "exact"}).in("id", identities.slice(index, index + 100)).order("id").range(start, end));
      for (const person of people) names.set(person.id, person.full_name);
    }
  } catch (error) { failure = error instanceof Error ? error.message : "Training evidence is unavailable."; }
  const title = <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Training value</p><h1 className="mt-2 text-4xl font-bold">Training activity, one clear estimate</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">$93 per private training session. Completed history and upcoming bookings stay separate from actual payments, money owed and package balances.</p></header>;
  if (failure) return <AppShell expectedRole="owner"><main className="mx-auto flex max-w-6xl flex-col gap-5 pb-12">{title}<section role="alert" className="rounded-2xl border border-status-limited/30 bg-white p-5"><h2 className="font-semibold text-cream">Training value is unavailable</h2><p className="mt-2 text-sm text-cream-dim">{failure} No partial or zero-dollar total was substituted.</p><Link href="/reports/training-value" className="mt-3 inline-flex min-h-11 items-center font-semibold text-sky">Reload report</Link></section></main></AppShell>;
  const analysis = analyzeTrainingValue(evidence.map(row => ({source_id: row.id, starts_at: row.scheduled_at,
    duration_minutes: row.duration_minutes, status: row.status, service: row.session_type, client_id: row.client_id, trainer_id: row.trainer_id})), observed.toISOString());
  const valued = analysis.rows.filter(row => row.state === "historical_completed" || row.state === "future_scheduled");
  const months = groups(valued, row => monthKey(row.starts_at));
  const coaches = groups(analysis.rows, row => row.trainer_id ?? "unassigned");
  const clients = groups(analysis.rows, row => row.client_id ?? "unassigned");
  const review = analysis.rows.filter(row => row.state === "needs_review");
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">{title}
    <p className="text-xs leading-5 text-cream-dim">Rolling window: 90 days back and 60 days ahead. {evidence.length} operational session records loaded. Read at {observed.toLocaleString("en-US", {timeZone: "America/Los_Angeles"})} Pacific. Refresh to pick up later changes. Staged source files are not operational sessions.</p>
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Completed training estimate" value={dollars(analysis.totals.historical_estimate_cents)} detail={analysis.totals.historical_count + " recorded completed sessions × $93"}/>
      <Metric label="Upcoming schedule estimate" value={dollars(analysis.totals.scheduled_estimate_cents)} detail={analysis.totals.scheduled_count + " scheduled/confirmed sessions × $93; not guaranteed revenue"}/>
      <Metric label="Needs review" value={String(analysis.totals.review_count)} detail="Unconfirmed, incomplete or conflicting evidence; not valued"/>
      <Metric label="Excluded" value={String(analysis.totals.excluded_count)} detail="Non-training, cancellations and no-shows; not valued"/>
    </section>
    {!evidence.length && <p className="rounded-2xl border border-divider bg-white p-5 text-sm text-cream-dim">No operational sessions are recorded in this window. Imported source appointments will contribute only after controlled import and status mapping. Missing evidence is not zero revenue.</p>}
    <Breakdown title="By Pacific month" rows={months} label={id => id}/>
    <Breakdown title="By coach" rows={coaches} label={id => names.get(id) ?? (id === "unassigned" ? "Unassigned coach" : "Coach " + id.slice(0, 8))}/>
    <Breakdown title="By client" rows={clients} label={id => names.get(id) ?? (id === "unassigned" ? "Unassigned client" : "Client " + id.slice(0, 8))}/>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Evidence needing attention</h2><p className="mt-1 text-xs text-cream-faint">A past booking does not prove attendance. No row is changed by this report.</p><div className="mt-3 divide-y divide-divider">{review.slice(0, 25).map(row => <Link key={row.source_id} href={"/sessions/" + row.source_id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-3"><span className="text-sm font-semibold text-cream">{names.get(row.client_id ?? "") ?? "Client record"}</span><span className="text-xs text-status-limited">{row.reason?.replaceAll("_", " ")}</span></Link>)}</div>{!review.length && <p className="mt-3 text-sm text-cream-dim">No unresolved valuation rows in the loaded window.</p>}{review.length > 25 && <p className="mt-3 text-xs text-cream-faint">Showing 25 of {review.length} unresolved rows.</p>}</section>
    <aside className="rounded-2xl border border-sky/20 bg-sky/5 p-5 text-sm leading-6 text-cream-dim">This is an owner-only estimate of training activity, not collected revenue, cash flow, an invoice or a statement of client debt. The $93 assumption is per session, not hourly. It does not consume package sessions, set client prices or calculate payroll. QuickBooks reconciliation is separate.<div className="mt-3 flex flex-wrap gap-5"><Link href="/financials" className="inline-flex min-h-11 items-center font-semibold text-sky">Actual financial records →</Link><Link href="/settings/migration" className="inline-flex min-h-11 items-center font-semibold text-sky">Migration evidence →</Link></div><p className="mt-2 text-xs text-cream-faint">Rule version: {analysis.rule_version}</p></aside>
  </main></AppShell>;
}
function Metric({label, value, detail}: {label: string; value: string; detail: string}) {
  return <div className="rounded-2xl border border-divider bg-white p-4"><h2 className="text-xs font-semibold text-cream-dim">{label}</h2><p className="mt-2 text-2xl font-bold text-cream">{value}</p><p className="mt-2 text-xs leading-5 text-cream-faint">{detail}</p></div>;
}
function Breakdown({title, rows, label}: {title: string; rows: ReturnType<typeof groups>; label: (id: string) => string}) {
  return <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">{title}</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">{title}: separate estimates for completed and scheduled training, with unresolved row counts.</caption><thead><tr className="text-xs text-cream-faint"><th scope="col" className="py-3">Group</th><th scope="col">Completed / estimate</th><th scope="col">Scheduled / estimate</th><th scope="col">Review</th></tr></thead><tbody className="divide-y divide-divider">{rows.map(row => <tr key={row.id}><th scope="row" className="py-3 pr-3 font-semibold text-cream">{label(row.id)}</th><td>{row.historical_count} / {dollars(row.historical_estimate_cents)}</td><td>{row.scheduled_count} / {dollars(row.scheduled_estimate_cents)}</td><td>{row.review_count}</td></tr>)}</tbody></table></div>{!rows.length && <p className="mt-3 text-sm text-cream-dim">No qualifying records for this breakdown.</p>}</section>;
}
