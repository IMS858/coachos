import Link from "next/link";

type Row = { id: string; client_id: string; name: string; status: string };

export function ClassRoster({ rows }: { rows: Row[] }) {
  return <section className="rounded-3xl border border-divider bg-white p-5">
    <h2 className="text-xl font-semibold text-cream">Class roster evidence</h2>
    <p className="mt-2 text-sm leading-6 text-cream-dim">
      Attendance editing is not launched. A reservation or waitlist entry is not proof that a client attended.
      The reviewed launch will use the scoped, audited attendance command rather than overwrite records directly.
    </p>
    <div className="mt-4 divide-y divide-divider">{rows.map(row =>
      <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <Link href={`/clients/${row.client_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">{row.name} →</Link>
          <p className="mt-1 text-xs text-cream-dim">Recorded status: {row.status.replaceAll("_", " ")}</p>
        </div>
        <span className="rounded-full bg-surface-soft px-3 py-2 text-xs font-semibold text-cream-faint">Read-only · Prelaunch</span>
      </article>
    )}</div>
    {rows.length === 0 && <p className="mt-4 text-sm text-cream-dim">No roster records in this view.</p>}
  </section>;
}
