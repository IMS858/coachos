import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {object, REVIEW_KINDS, REVIEW_UUID, sourceTitle, type ReviewKind} from "@/lib/migration/owner-review";
import {OwnerReviewForm, type ReviewOption, type SavedOwnerReview} from "@/components/migration/owner-review-form";
export const dynamic = "force-dynamic";
type SourceRow = {id: string; source_id: string; source_hash: string; record_type: ReviewKind; source_payload: unknown; reconciliation_status: string};
type Latest = SavedOwnerReview & {id: string; record_id: string};
type Profile = ReviewOption & {role: string};
const sourceColumns = "id,source_id,source_hash,record_type,source_payload,reconciliation_status";
const reviewColumns = "id,record_id,revision,source_hash,decision,proposal,reason,created_at";
const PAGE_SIZE = 25;
function href(batch: string, kind: string, page: number, record?: string) {
  const params = new URLSearchParams({batch, type: kind, page: String(page)});
  if (record) params.set("record", record);
  return "/settings/migration/review?" + params.toString();
}
export default async function MigrationReviewPage({searchParams}: {searchParams: Promise<{batch?: string; type?: string; page?: string; record?: string}>}) {
  const db = await createClient(), {data: {user}} = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) throw new Error("Owner authorization unavailable.");
  if (!me.data || me.data.deleted_at || me.data.role !== "owner") redirect("/dashboard");
  const params = await searchParams;
  if (params.batch && !REVIEW_UUID.test(params.batch)) notFound();
  if (params.record && !REVIEW_UUID.test(params.record)) notFound();
  const kind = params.type ?? "client";
  if (!REVIEW_KINDS.includes(kind as ReviewKind)) notFound();
  if (params.page && !/^[1-9]\d{0,4}$/.test(params.page)) notFound();
  const page = Number(params.page ?? "1");
  const batchQuery = db.from("migration_batches").select("id,label,status");
  const batchQ = params.batch ? await batchQuery.eq("id", params.batch).maybeSingle() : await batchQuery.order("created_at", {ascending: false}).order("id").limit(1).maybeSingle();
  if (batchQ.error) throw new Error("Migration batch unavailable. Nothing was inferred.");
  if (!batchQ.data) return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl p-5"><h1 className="text-3xl font-bold text-cream">Owner migration review</h1><p className="mt-4 text-cream-dim">No source batch is available. Uploading and operational importing are separate steps.</p><Link className="mt-4 inline-flex min-h-11 items-center text-sky" href="/settings/migration">Back to Migration Center</Link></main></AppShell>;
  const batch = batchQ.data, start = (page - 1) * PAGE_SIZE;
  const recordsQ = await db.from("migration_records").select(sourceColumns, {count: "exact"}).eq("batch_id", batch.id).eq("record_type", kind).order("source_id").order("id").range(start, start + PAGE_SIZE - 1);
  if (recordsQ.error || recordsQ.data === null || recordsQ.count === null || !Number.isSafeInteger(recordsQ.count)) throw new Error("Source evidence unavailable. A failed load is not an empty batch.");
  if (recordsQ.count < 0 || recordsQ.data.length !== Math.min(PAGE_SIZE, Math.max(0, recordsQ.count - start))) throw new Error("Source page was incomplete. Refresh before reviewing.");
  if (page > 1 && start >= recordsQ.count) notFound();
  const records = recordsQ.data as SourceRow[], total = recordsQ.count;
  const selected = params.record ? records.find(r => r.id === params.record) : records[0];
  if (params.record && !selected) notFound();
  let latest: Latest[] = [], history: Latest[] = [], clients: ReviewOption[] = [], trainers: ReviewOption[] = [], unavailable = false;
  if (selected) {
    try {
      const [latestQ, historyQ, clientRows, profiles] = await Promise.all([
        db.from("migration_latest_record_reviews").select(reviewColumns).in("record_id", records.map(r => r.id)),
        db.from("migration_record_reviews").select(reviewColumns).eq("record_id", selected.id).order("revision", {ascending: false}).limit(10),
        readCompleteEvidence<{id: string}>((from, to) => db.from("clients").select("id", {count: "exact"}).order("id").range(from, to)),
        readCompleteEvidence<Profile>((from, to) => db.from("profiles").select("id,full_name,email,role", {count: "exact"}).is("deleted_at", null).order("id").range(from, to)),
      ]);
      if (latestQ.error || historyQ.error || !latestQ.data || !historyQ.data) throw new Error("Review storage unavailable");
      latest = latestQ.data as Latest[]; history = historyQ.data as Latest[];
      if (new Set(latest.map(r => r.record_id)).size !== latest.length || latest.some(r => !records.some(source => source.id === r.record_id))) throw new Error("Conflicting review receipts");
      const clientIds = new Set(clientRows.map(c => c.id));
      clients = profiles.filter(p => p.role === "client" && clientIds.has(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
      trainers = profiles.filter(p => ["owner", "trainer"].includes(p.role)).sort((a, b) => a.full_name.localeCompare(b.full_name));
    } catch {unavailable = true;}
  }
  const currentReview = selected ? latest.find(r => r.record_id === selected.id) ?? null : null;
  const fields = selected && object(selected.source_payload) && object(selected.source_payload.fields) ? selected.source_payload.fields : null;
  return <AppShell expectedRole="owner"><main className="mx-auto flex max-w-7xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Owner review</p><h1 className="mt-2 text-3xl font-bold">Resolve the calendar and opening balances</h1><p className="mt-3 text-sm leading-6 text-white/75">{batch.label}. Original source evidence stays unchanged. Owner reviews are versioned proposals, not import approvals or payment receipts.</p><Link href={"/settings/migration?batch=" + batch.id} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-white">← Migration Center</Link></header>
    <nav aria-label="Evidence review type" className="flex flex-wrap gap-2">{REVIEW_KINDS.map(type => <Link key={type} href={href(batch.id, type, 1)} aria-current={type === kind ? "page" : undefined} className={"inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold capitalize " + (type === kind ? "border-sky bg-sky text-white" : "border-divider bg-white text-cream")}>{type === "appointment" ? "Calendar" : type === "package" ? "Package openings" : "Client matches"}</Link>)}</nav>
    <p className="text-xs leading-5 text-cream-dim">{total} saved {kind} source records in this batch. Showing {total ? start + 1 : 0}–{Math.min(start + PAGE_SIZE, total)}. This is not a claim that the source upload is complete. Membership billing and transaction settlement remain separate.</p>
    {!selected ? <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">No saved {kind} evidence in this batch</h2><p className="mt-2 text-sm text-cream-dim">There is nothing to review here yet. Prepared files, staged records and imported records are different states.</p></section> : <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-divider bg-white p-3"><h2 className="px-2 py-2 text-sm font-semibold text-cream">Source records</h2><nav aria-label="Source records" className="space-y-1">{records.map(r => {
        const review = latest.find(x => x.record_id === r.id);
        const state = unavailable ? "Review status unavailable" : review ? review.source_hash !== r.source_hash ? "Source changed — recheck" : `Owner ${review.decision} · v${review.revision}` : "Not yet owner-reviewed";
        return <Link key={r.id} href={href(batch.id, kind, page, r.id)} aria-current={r.id === selected.id ? "page" : undefined} className={"block min-h-14 rounded-xl p-3 " + (r.id === selected.id ? "bg-sky/10 ring-1 ring-sky/20" : "hover:bg-surface-soft")}><span className="block break-words text-sm font-semibold text-cream">{sourceTitle(r.source_payload, r.source_id)}</span><span className="mt-1 block text-xs text-cream-faint">{state}</span></Link>;
      })}</nav><div className="mt-3 flex justify-between gap-3">{page > 1 && <Link className="inline-flex min-h-11 items-center text-sm text-sky" href={href(batch.id, kind, page - 1)}>Previous</Link>}{start + PAGE_SIZE < total && <Link className="inline-flex min-h-11 items-center text-sm text-sky" href={href(batch.id, kind, page + 1)}>Next</Link>}</div></aside>
      <div className="min-w-0 space-y-5"><section className="rounded-3xl border border-divider bg-white p-5"><p className="text-xs uppercase tracking-wider text-cream-faint">Preserved source — not edited here</p><h2 className="mt-2 break-words text-2xl font-bold text-cream">{sourceTitle(selected.source_payload, selected.source_id)}</h2><p className="mt-2 break-all text-xs text-cream-faint">Source ID: {selected.source_id}</p>{fields && <dl className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(fields).filter(([key]) => !["Email", "Phones", "Source URL", "Raw height", "Status class", "Calendar ID", "Staff/calendar key"].includes(key)).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs text-cream-faint">{key}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm text-cream">{value === null || value === "" ? "Not recorded in source" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>}<details className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-sky">Full source fields and provenance</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-soft p-3 text-xs text-cream-dim">{JSON.stringify(selected.source_payload, null, 2)}</pre><p className="mt-2 break-all text-xs text-cream-faint">Source checksum: {selected.source_hash}</p></details></section>
        {unavailable ? <section role="alert" className="rounded-2xl border border-status-limited/20 bg-white p-5"><h2 className="font-semibold text-status-limited">Owner review is unavailable</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Review storage or destination identities could not be loaded. The new review migration may still need rollout. No review status or zero balance was inferred, and saving is disabled.</p><Link href={href(batch.id, kind, page, selected.id)} className="mt-2 inline-flex min-h-11 items-center text-sky">Retry this page</Link></section> : <><OwnerReviewForm key={`${selected.id}:${selected.source_hash}:${currentReview?.revision ?? 0}`} recordId={selected.id} sourceHash={selected.source_hash} kind={kind as ReviewKind} latest={currentReview} clients={clients} trainers={trainers} frozen={!["draft", "review"].includes(batch.status) || selected.reconciliation_status === "imported"}/><section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Saved review history</h2><p className="mt-1 text-xs text-cream-faint">Latest 10 revisions for this source record. Corrections append a revision; original decisions remain available.</p>{history.length ? history.map(review => <details key={review.id} className="mt-3 border-t border-divider pt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm text-cream">Revision {review.revision} · {review.decision} · {new Date(review.created_at).toLocaleString("en-US", {timeZone: "America/Los_Angeles"})} Pacific</summary><p className="text-sm text-cream-dim">{review.reason}</p><pre className="mt-2 whitespace-pre-wrap break-all rounded-xl bg-surface-soft p-3 text-xs text-cream-dim">{JSON.stringify(review.proposal, null, 2)}</pre></details>) : <p className="mt-3 text-sm text-cream-dim">No saved owner review for this record.</p>}</section></>}
      </div>
    </div>}
  </main></AppShell>;
}
