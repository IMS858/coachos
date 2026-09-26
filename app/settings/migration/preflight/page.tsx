import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {REVIEW_UUID} from "@/lib/migration/owner-review";
import {loadCalendarPreflight, PREFLIGHT_BATCH_COLUMNS} from "@/lib/migration/calendar-preflight-load";
import type {PreflightBatch, CalendarReviewState} from "@/lib/migration/calendar-preflight";
export const dynamic = "force-dynamic";
const box = "rounded-2xl border border-divider bg-white p-5";
const link = "inline-flex min-h-11 items-center font-semibold text-sky";
const labels: Record<CalendarReviewState, string> = {
  unreviewed: "Unreviewed", held: "On hold", stale: "Stale / invalid review",
  reviewed: "Reviewed · fresh checks still required", excluded: "Owner-excluded", imported: "Recorded imported state",
};
const coverageLabels = {
  undeclared: "Source totals have not been declared",
  invalid_declaration: "Source count declaration is invalid",
  count_mismatch: "Staged evidence does not match declared counts",
  receipt_missing: "Completed-staging receipt is missing or invalid",
  declared_counts_match: "Declared staging counts match · cutover remains separate",
};
export default async function MigrationPreflight({searchParams}: {searchParams: Promise<{batch?: string | string[]}>}) {
  const db = await createClient(), {data: {user}} = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) throw new Error("Owner authorization unavailable.");
  if (!me.data || me.data.deleted_at || me.data.role !== "owner") redirect("/dashboard");
  const params = await searchParams;
  if (params.batch !== undefined && (typeof params.batch !== "string" || !REVIEW_UUID.test(params.batch))) notFound();
  const batchQuery = db.from("migration_batches").select(PREFLIGHT_BATCH_COLUMNS);
  const batchQ = params.batch ? await batchQuery.eq("id", params.batch).maybeSingle()
    : await batchQuery.order("created_at", {ascending: false}).order("id").limit(1).maybeSingle();
  if (batchQ.error) throw new Error("Migration batch unavailable.");
  if (!batchQ.data) {
    if (params.batch) notFound();
    return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl p-5"><h1 className="text-3xl font-bold">Calendar preflight</h1><p className="mt-3 text-sm text-cream-dim">No migration batch is available. No calendar clearance was inferred.</p></main></AppShell>;
  }
  const batch = batchQ.data as PreflightBatch;
  let data: Awaited<ReturnType<typeof loadCalendarPreflight>>;
  try {data = await loadCalendarPreflight(db, batch);} catch {
    return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl space-y-4 pb-12"><h1 className="text-3xl font-bold">Calendar preflight unavailable</h1><section role="alert" className={box}><p>Source or review evidence could not be loaded completely. No zero counts, complete-staging badge or import readiness were inferred. Refresh and retry.</p></section><Link href={"/settings/migration?batch=" + batch.id} className={link}>Migration Center →</Link></main></AppShell>;
  }
  return <AppShell expectedRole="owner"><main className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Migration preflight</p><h1 className="mt-2 text-3xl font-bold">Calendar cutover evidence</h1><p className="mt-3 text-sm leading-6 text-white/75">{batch.label}. Read-only observations, not permission to import. No appointment, package, payment or notification is created here.</p></header>
    <section className={box}><h2 className="text-lg font-semibold">{coverageLabels[data.coverageState]}</h2><p className="mt-2 text-sm leading-6 text-cream-dim">A count match records declared coverage; it does not independently verify the original files, client identities, timezone, durations, recurrence exceptions or opening balances.</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[430px] text-left text-sm"><caption className="sr-only">Migration source coverage by evidence type</caption><thead><tr>{["Evidence", "Staged", "Declared total", "Missing / excess"].map(title => <th key={title} scope="col" className="border-b border-divider py-3 pr-4">{title}</th>)}</tr></thead><tbody>{data.coverage.map(row => <tr key={row.kind}><th scope="row" className="border-b border-divider py-3 pr-4 font-normal capitalize">{row.kind}</th><td className="border-b border-divider py-3 pr-4">{row.staged}</td><td className="border-b border-divider py-3 pr-4">{row.expected ?? "Not declared"}</td><td className="border-b border-divider py-3">{row.missing === null ? "Unknown" : row.excess ? `${row.excess} excess` : `${row.missing} missing`}</td></tr>)}</tbody></table></div></section>
    {data.calendarRows === 0 ? <section role="alert" className={box}><h2 className="text-lg font-semibold">No appointment evidence staged</h2><p className="mt-2 text-sm leading-6 text-cream-dim">This is not an empty or cleared live calendar. Stage and verify the original appointment evidence before evaluating calendar readiness.</p></section> : <section aria-label="Appointment review observations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data.reviewCounts).map(([state, count]) => <article key={state} className={box}><p className="text-3xl font-bold">{count}</p><h2 className="mt-2 text-sm text-cream-dim">{labels[state as CalendarReviewState]}</h2></article>)}</section>}
    <section className={box}><h2 className="text-lg font-semibold">Fresh checks before cutover</h2><p className="mt-2 text-sm leading-6 text-cream-dim">{data.storedReadyMarkers} reviewed appointment rows carry a stored ready marker. Those legacy markers do not identify a collision-check time or review revision, so this page does not count them as current schedule clearance. Owner review, complete source verification, current collision checks and explicit batch approval remain separate gates.</p><p className="mt-3 text-xs leading-5 text-cream-faint">Read completed {data.observedAt}. Paged evidence observations are not a transaction-isolated snapshot. Recorded imported states are not independently reconciled destination receipts.</p><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">{[["appointment", "Review appointments"], ["client", "Review client identities"], ["package", "Review package openings"]].map(([kind, title]) => <Link key={kind} href={"/settings/migration/review?batch=" + batch.id + "&type=" + kind + "&page=1"} className={link}>{title} →</Link>)}<Link href={"/settings/migration?batch=" + batch.id} className={link}>Migration Center →</Link></div></section>
  </main></AppShell>;
}
