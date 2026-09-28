import Link from "next/link";
import {notFound} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {requireOwnerData} from "@/lib/auth/require-owner";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {SOURCE_TYPES, filterSourceRows, sourceFields, sourceLabel, sourceObservation, type SourceType, type SourceBrowserRow} from "@/lib/migration/source-browser";
import {REVIEW_UUID} from "@/lib/migration/owner-review";
import {pacificDate} from "@/lib/time/pacific";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not supplied";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export default async function MigrationEvidencePage({searchParams}: {
  searchParams: Promise<{batch?: string; type?: string; page?: string; q?: string}>;
}) {
  const db = await requireOwnerData();
  const params = await searchParams;
  const type = (params.type ?? "client") as SourceType;
  if (!SOURCE_TYPES.includes(type) || (params.page !== undefined && !/^[1-9]\d{0,4}$/.test(params.page))) notFound();
  if (params.q !== undefined && (typeof params.q !== "string" || params.q.length > 200)) notFound();
  const page = Number(params.page ?? "1"), query = params.q ?? "";
  const columns = "id,label,status,source_as_of,approved_at";
  let batch;
  if (params.batch !== undefined) {
    if (typeof params.batch !== "string" || !REVIEW_UUID.test(params.batch)) notFound();
    const selected = await db.from("migration_batches").select(columns).eq("id", params.batch).maybeSingle();
    if (selected.error) throw new Error("Migration batch could not be loaded.");
    if (!selected.data) notFound();
    batch = selected.data;
  } else {
    const latest = await db.from("migration_batches").select(columns).order("created_at", {ascending: false}).order("id").limit(1).maybeSingle();
    if (latest.error) throw new Error("Migration batch could not be loaded.");
    batch = latest.data;
  }
  if (!batch) return <AppShell expectedRole="owner"><main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-bold">Source evidence</h1><p className="mt-3 text-cream-dim">No migration batch is available.</p></main></AppShell>;
  // Complete, stable paging before local search: a match on a later page must not disappear.
  const rows = await readCompleteEvidence<SourceBrowserRow>((from, to) => db.from("migration_records")
    .select("id,record_type,source_id,source_payload,reconciliation_status,destination_id,destination_trainer_id,review_note,dry_run_reason", {count: "exact"})
    .eq("batch_id", batch.id).eq("record_type", type).order("id").range(from, to));
  const filtered = filterSourceRows(rows, query), pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > pages) notFound();
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const counts = await Promise.all(SOURCE_TYPES.map(async kind => {
    const result = await db.from("migration_records").select("id", {count: "exact", head: true}).eq("batch_id", batch.id).eq("record_type", kind);
    if (result.error || result.count === null) throw new Error("Source evidence counts could not be loaded.");
    return [kind, result.count] as const;
  }));
  const countMap = new Map(counts), today = pacificDate(new Date());
  const href = (kind: string, p = 1) => "/settings/migration/evidence?" + new URLSearchParams({batch: batch.id, type: kind, page: String(p), ...(query ? {q: query} : {})});
  const imported = rows.filter(row => row.reconciliation_status === "imported").length;
  const linked = rows.filter(row => row.destination_id !== null && row.reconciliation_status !== "imported").length;
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Source records & import status</p><h1 className="mt-2 text-4xl font-bold">Vagaro source browser</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{batch.label} · batch status: {batch.status}. Source confirmation is separate from operational import. Historical contacts are not automatically active clients; source transactions are not new charges.</p>
      <Link href="/schedule" className="mt-3 inline-flex min-h-11 items-center font-semibold text-white underline">Open Coach OS calendar →</Link>
    </header>
    <nav aria-label="Source evidence types" className="flex flex-wrap gap-2">{SOURCE_TYPES.map(kind => <Link key={kind} href={href(kind)} aria-current={kind === type ? "page" : undefined} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${kind === type ? "border-sky bg-sky text-white" : "border-divider bg-white text-cream"}`}>{kind[0].toUpperCase() + kind.slice(1)} · {countMap.get(kind)}</Link>)}</nav>
    <section className="rounded-3xl border border-divider bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold capitalize text-cream">{type} evidence</h2><p className="mt-1 text-sm text-cream-dim">{rows.length} source rows · {imported} recorded imported · {linked} linked without import · {rows.length - imported - linked} other source rows</p></div><Link href={`/settings/migration?batch=${batch.id}`} className="text-sm font-semibold text-sky">Migration Center →</Link></div>
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3"><input type="hidden" name="batch" value={batch.id}/><input type="hidden" name="type" value={type}/><label className="min-w-0 flex-1 text-sm font-medium text-cream">Search all {type} source rows<input name="q" defaultValue={query} maxLength={200} placeholder="Name, source ID or source field" className="mt-1 block min-h-11 w-full rounded-xl border border-divider bg-white px-3"/></label><button className="min-h-11 rounded-xl bg-sky px-5 font-semibold text-white" type="submit">Search</button>{query && <Link href={`/settings/migration/evidence?batch=${batch.id}&type=${type}`} className="min-h-11 py-3 text-sm text-sky">Clear</Link>}</form>
      <p className="mt-3 text-sm text-cream-dim">{filtered.length} matching source rows · page {page} of {pages}. Counts are read-time observations, not independent destination reconciliation.</p>
      {!visible.length && <p className="py-8 text-sm text-cream-dim">No source rows match this search. No change to your live clients or calendar was inferred.</p>}
      <div className="mt-4 divide-y divide-divider">{visible.map(row => {
        const fields = sourceFields(row), observation = sourceObservation(row, today);
        const date = fields["Raw date"];
        return <details key={row.id} className="py-4"><summary className="cursor-pointer"><span className="font-semibold text-cream">{sourceLabel(row)}</span><span className="ml-3 rounded-full bg-surface-soft px-2.5 py-1 text-xs text-cream-dim">{row.reconciliation_status === "imported" ? "Recorded imported" : row.reconciliation_status}</span></summary>
          <p className="mt-2 break-all text-xs text-cream-faint">Source ID: {row.source_id}</p>
          {observation && <p className="mt-3 rounded-xl border border-divider p-3 text-sm leading-6 text-cream-dim">{observation}</p>}
          <div className="mt-2 flex flex-wrap gap-4 text-sm font-semibold text-sky">{row.destination_id && ["client", "appointment"].includes(row.record_type) && <Link href={`/clients/${row.destination_id}`} className="min-h-11 py-3">Open linked client →</Link>}{row.record_type === "appointment" && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && <Link href={`/schedule?date=${date}`} className="min-h-11 py-3">Open calendar day →</Link>}</div>
          <dl className="mt-3 grid gap-x-5 gap-y-3 rounded-2xl bg-surface-soft p-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(fields).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-cream-faint">{key}</dt><dd className="mt-1 break-words text-sm text-cream">{displayValue(value)}</dd></div>)}</dl>
          <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-sky">Original provenance & raw evidence</summary><p className="mt-2 text-xs text-cream-dim">Original export notes and HOLD labels are preserved below. They are not overwritten by later reviews or imports.</p><pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-[#101317] p-4 text-xs text-white/80">{JSON.stringify(row.source_payload, null, 2)}</pre></details>
        </details>;
      })}</div>
      <div className="mt-5 flex items-center justify-between">{page > 1 ? <Link className="min-h-11 py-3 font-semibold text-sky" href={href(type, page - 1)}>← Previous</Link> : <span/>}{page < pages ? <Link className="min-h-11 py-3 font-semibold text-sky" href={href(type, page + 1)}>Next →</Link> : <span/>}</div>
    </section>
  </main></AppShell>;
}
