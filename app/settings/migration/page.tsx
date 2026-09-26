import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {cutoverReadiness} from "@/lib/migration/cutover-readiness";
import {migrationSourceCoverage} from "@/lib/migration/source-coverage";
export const dynamic = "force-dynamic";
const batchColumns = "id,label,source_system,source_as_of,status,created_at,expected_counts,source_manifest_sha256,staging_completed_at";
type EvidenceRow = {id: string; record_type: string; source_hash: string; reconciliation_status: string; dry_run_status: string | null; dry_run_reason: string | null};

export default async function MigrationCenter({searchParams}: {searchParams: Promise<{batch?: string}>}) {
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) throw new Error("Owner authorization unavailable.");
  if (!me.data || me.data.role !== "owner" || me.data.deleted_at) redirect("/dashboard");
  const batchesQ = await db.from("migration_batches").select(batchColumns).order("created_at", {ascending: false}).order("id").limit(20);
  if (batchesQ.error) throw new Error("Migration batches could not be loaded.");
  const requested = (await searchParams).batch;
  let batch = batchesQ.data?.[0] ?? null;
  if (requested) {
    if (!/^[0-9a-f-]{36}$/i.test(requested)) notFound();
    const selected = await db.from("migration_batches").select(batchColumns).eq("id", requested).maybeSingle();
    if (selected.error) throw new Error("Selected migration batch could not be loaded.");
    if (!selected.data) notFound();
    batch = selected.data;
  }
  const [clientsQ, sessionsQ, plansQ, paymentsQ] = await Promise.all([
    db.from("clients").select("id", {count: "exact", head: true}),
    db.from("sessions").select("id", {count: "exact", head: true}),
    db.from("plans").select("id", {count: "exact", head: true}).eq("status", "active"),
    db.from("payments").select("id", {count: "exact", head: true}),
  ]);
  if ([clientsQ, sessionsQ, plansQ, paymentsQ].some(result => result.error || result.count === null)) throw new Error("Migration evidence could not be loaded. No readiness state was inferred.");
  const records = batch ? await readCompleteEvidence<EvidenceRow>((start, end) => db.from("migration_records")
    .select("id,record_type,source_hash,reconciliation_status,dry_run_status,dry_run_reason", {count: "exact"})
    .eq("batch_id", batch!.id).order("id").range(start, end)) : [];
  const trainers = await readCompleteEvidence<{id: string; full_name: string; email: string; role: string}>((start, end) => db.from("profiles")
    .select("id,full_name,email,role", {count: "exact"}).in("role", ["owner", "trainer"]).is("deleted_at", null).order("id").range(start, end));
  const count = (type: string, status?: string) => records.filter(row => row.record_type === type && (!status || row.reconciliation_status === status)).length;
  const appointments = records.filter(row => row.record_type === "appointment");
  const sourceCoverage = migrationSourceCoverage(records, Boolean(batch?.staging_completed_at));
  let reviewSummary: ReturnType<typeof cutoverReadiness> | null = null;
  let reviewStorageUnavailable = false;
  if (batch && records.length) {
    const reviewsQ = await db.from("migration_latest_record_reviews").select("record_id,record_type,source_hash,revision,decision").in("record_id", records.map(row => row.id));
    if (reviewsQ.error) reviewStorageUnavailable = true;
    else reviewSummary = cutoverReadiness(records, (reviewsQ.data ?? []) as any);
  }
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Migration Center</p><h1 className="mt-2 text-4xl font-bold">Source evidence → reconciliation → import</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">Vagaro stays read-only. Source records land here first; uncertain identity, package, schedule and money evidence stays Needs Review until explicitly resolved.</p></header>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Coach OS clients", clientsQ.count], ["Coach OS sessions", sessionsQ.count], ["Active plans", plansQ.count], ["Payment rows", paymentsQ.count]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-divider bg-white p-4"><p className="text-3xl font-bold text-cream">{value}</p><p className="mt-1 text-xs text-cream-faint">{label}</p></div>)}</section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Staged source evidence</h2><p className="mt-1 text-sm text-cream-dim">{batch ? batch.label : "No source batch"}</p><p className="mt-1 text-xs leading-5 text-cream-faint">{records.length} saved rows in this batch only. All pages are checked before totaling. These counts do not establish that the source export has been fully uploaded. ${batch?.staging_completed_at ? "A complete staging receipt is recorded for this batch." : "No complete staging receipt is recorded yet."}</p>{batch && <Link href={"/settings/migration/review?batch=" + batch.id} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky px-4 py-3 text-sm font-semibold text-white">Review clients, calendar &amp; package openings →</Link>}<div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">{["client", "appointment", "series", "package", "membership", "transaction"].map(type => <div key={type} className="rounded-xl bg-surface-soft p-3"><p className="text-2xl font-bold text-cream">{count(type)}</p><p className="text-xs capitalize text-cream-faint">{type}</p><p className="mt-1 text-[11px] text-status-limited">{count(type, "needs_review")} needs review</p></div>)}</div>{!records.length && <p className="mt-4 text-sm text-cream-dim">No source records have been staged in the selected batch.</p>}</section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Historical training value</h2><p className="mt-2 text-sm leading-6 text-cream-dim">The $93/session estimate now lives in the owner Training Value report. Completed operational sessions and upcoming scheduled sessions are analyzed separately by client, coach and Pacific month. Unmapped source rows do not become revenue or completed training just because they are old.</p><Link href="/reports/training-value" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white">Open Training Value →</Link></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Schedule dry run</h2><div className="mt-3 grid grid-cols-3 gap-2">{[["Source appointments", appointments.length], ["Recorded ready flags", appointments.filter(row => row.dry_run_status === "ready").length], ["Held", appointments.filter(row => row.dry_run_status === "hold").length]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-surface-soft p-3"><p className="text-2xl font-bold text-cream">{value}</p><p className="text-xs text-cream-faint">{label}</p></div>)}</div><p className="mt-3 text-xs leading-5 text-cream-dim">Dry-run flags are recorded proposals, not import approvals. Held and unevaluated rows remain source evidence only. Identity, time, duration, status and conflict evidence must be resolved before import.</p></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Source coverage gate</h2><div className="mt-3 grid grid-cols-3 gap-2">{["client","appointment","package"].map(type => <div key={type} className="rounded-xl bg-surface-soft p-3"><p className="text-2xl font-bold text-cream">{sourceCoverage.counts.get(type) ?? 0}</p><p className="text-xs capitalize text-cream-faint">{type}</p></div>)}</div><p className="mt-3 text-xs leading-5 text-cream-dim">{sourceCoverage.missing.length ? `Missing required source evidence: ${sourceCoverage.missing.join(", ")}. Calendar/package cutover stays blocked.` : "Core evidence types are present, but export completeness has not been declared. Counts alone do not prove the Vagaro audit is complete."}</p></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Owner review readiness</h2>{reviewStorageUnavailable ? <p className="mt-2 text-sm leading-6 text-status-limited">Owner-review storage is not active in this database, so no review readiness was inferred. Source evidence remains unchanged.</p> : reviewSummary ? <><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">{[["Preflight ready",reviewSummary.preflightReady],["Needs preflight",reviewSummary.needsPreflight],["Held",reviewSummary.held],["Stale",reviewSummary.stale],["Unreviewed",reviewSummary.unreviewed]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-surface-soft p-3"><p className="text-2xl font-bold text-cream">{value}</p><p className="text-xs text-cream-faint">{label}</p></div>)}</div><p className="mt-3 text-xs leading-5 text-cream-dim">{reviewSummary.complete ? "Review coverage is complete for operational preflight. This is still not import approval." : "Reviewed appointments still need a fresh collision preflight. Held, stale and unreviewed evidence cannot enter operational import."}</p></> : <p className="mt-2 text-sm text-cream-dim">No staged records are available for review readiness.</p>}</section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Import boundary</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Staging a record is not importing it. Matching a client is not confirming a package balance. A displayed package value is not customer debt. Appointments are not created until trainer identity, time, status and duplicate checks are resolved. Payments are not recreated from transaction evidence without accounting reconciliation.</p></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Destination staff identities</h2><p className="mt-1 text-xs text-cream-faint">Source calendars cannot import until their staff identity exists here with the correct role.</p><div className="mt-3 divide-y divide-divider">{trainers.map(person => <div key={person.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold text-cream">{person.full_name}</p><p className="text-xs text-cream-faint">{person.email}</p></div><span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs capitalize text-cream-dim">{person.role}</span></div>)}</div></section>
    <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Recent batches</h2><p className="mt-1 text-xs text-cream-faint">Showing up to 20 recent batches. Select one to analyze its evidence without mixing duplicate source exports.</p><div className="mt-3 divide-y divide-divider">{(batchesQ.data ?? []).map(item => <Link key={item.id} href={"/settings/migration?batch=" + item.id} aria-current={item.id === batch?.id ? "page" : undefined} className="flex min-h-14 items-center justify-between gap-3 py-3"><span className="font-semibold text-sky">{item.label}</span><span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs capitalize text-cream-dim">{item.status}</span></Link>)}</div></section>
  </main></AppShell>;
}
