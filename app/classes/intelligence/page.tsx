import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { summarizeClassDemand, type ClassDemandRow } from "@/lib/classes/intelligence";
import { summarizeClassTimeSlots } from "@/lib/classes/time-intelligence";

export const dynamic = "force-dynamic";
const pct = (value: number | null) => value === null ? "—" : Math.round(value * 100) + "%";

export default async function ClassIntelligencePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) throw new Error("Class intelligence authorization unavailable.");
  if (!me.data || me.data.role !== "owner" || me.data.deleted_at) redirect("/dashboard");

  // One server-side time snapshot bounds every evidence query in this response.
  const asOf = new Date();
  const from = new Date(asOf.getTime() - 180 * 86400000).toISOString();
  const occurrences = await db.from("class_occurrences")
    .select("id,template_id,trainer_id,starts_at,capacity,status", { count: "exact" })
    .gte("starts_at", from).lte("starts_at", asOf.toISOString())
    .neq("status", "cancelled").order("starts_at", { ascending: false }).order("id").limit(1000);
  if (occurrences.error || occurrences.count === null) throw new Error("Class occurrence evidence unavailable.");
  const loaded = occurrences.data ?? [];
  const ids = loaded.map(row => row.id);
  const templateIds = [...new Set(loaded.map(row => row.template_id))];
  const [enrollments, templates] = await Promise.all([
    ids.length ? db.from("class_enrollments")
      .select("occurrence_id,client_id,status", { count: "exact" }).in("occurrence_id", ids).limit(10000)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    templateIds.length ? db.from("class_templates")
      .select("id,name,category").in("id", templateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (enrollments.error || enrollments.count === null || templates.error) {
    throw new Error("Class enrollment or template evidence unavailable.");
  }
  if ((enrollments.data ?? []).length !== enrollments.count) {
    throw new Error("Class enrollment evidence is incomplete. No partial totals or fill rates were substituted.");
  }
  const catalog = new Map((templates.data ?? []).map(template => [template.id, template]));
  if (templateIds.some(id => !catalog.has(id))) throw new Error("Class template evidence is incomplete.");
  const by = new Map<string, { client_id: string; status: string }[]>();
  for (const enrollment of enrollments.data ?? []) {
    by.set(enrollment.occurrence_id, [...(by.get(enrollment.occurrence_id) ?? []), {
      client_id: enrollment.client_id, status: enrollment.status,
    }]);
  }
  const rows: ClassDemandRow[] = loaded.map(row => ({
    occurrence_id: row.id, template_id: row.template_id, trainer_id: row.trainer_id,
    starts_at: row.starts_at, capacity: row.capacity, status: row.status,
    name: catalog.get(row.template_id)!.name, category: catalog.get(row.template_id)!.category,
    enrollments: by.get(row.id) ?? [],
  }));
  const summary = summarizeClassDemand(rows);
  const timeSlots = summarizeClassTimeSlots(rows).slice(0, 12);
  const totals = summary.reduce((sum, item) => ({
    occurrences: sum.occurrences + item.occurrences, capacity: sum.capacity + item.capacity,
    booked: sum.booked + item.booked, attended: sum.attended + item.attended,
    waitlisted: sum.waitlisted + item.waitlisted,
  }), { occurrences: 0, capacity: 0, booked: 0, attended: 0, waitlisted: 0 });
  const limited = occurrences.count > loaded.length;
  const metrics = [
    [String(totals.occurrences), "loaded past class dates"],
    [String(totals.booked), "booked / attended / no-show seats"],
    [String(totals.attended), "recorded attendance statuses"],
    [String(totals.waitlisted), "waitlist records"],
    [pct(totals.capacity ? totals.booked / totals.capacity : null), "recorded fill rate"],
  ];

  return <AppShell expectedRole="owner"><div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/60">IMS / Class Intelligence</p>
      <h1 className="mt-2 text-4xl font-bold">What the class evidence says</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">Historical capacity, bookings, attendance, waitlists and repeat participation. These are recorded facts—not demand forecasts or recommendations to add/cancel classes.</p>
    </header>
    <p className="text-xs leading-5 text-cream-dim">Last 180 days through {asOf.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}. Up to 1,000 non-cancelled class dates. Past dates can still have unresolved attendance; this is not a count of completed services.</p>
    {limited && <p role="alert" className="rounded-xl border border-status-limited/30 bg-white p-4 text-sm text-status-limited">Showing {loaded.length} of {occurrences.count} past class dates. All metrics below describe only this loaded window, not the full 180-day period.</p>}
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Loaded class evidence">
      {metrics.map(([value, label]) => <div key={label} className="rounded-2xl border border-divider bg-white p-4">
        <p className="text-3xl font-bold text-cream">{value}</p><p className="mt-2 text-xs leading-5 text-cream-faint">{label}</p>
      </div>)}
    </section>
    <section className="rounded-3xl border border-divider bg-white p-5">
      <h2 className="text-lg font-semibold text-cream">By class</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Class evidence in the loaded historical window</caption>
        <thead className="text-xs uppercase text-cream-faint"><tr>{["Class", "Occurrences", "Fill", "Attendance", "Waitlist", "Unique", "Repeat"].map(label => <th key={label} scope="col" className="pb-3 pr-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-divider">{summary.map(item => <tr key={item.template_id}>
          <th scope="row" className="py-3 pr-3 font-normal"><p className="font-semibold text-cream">{item.name}</p><p className="text-xs capitalize text-cream-faint">{item.category}</p></th>
          <td>{item.occurrences}</td><td>{pct(item.fill_rate)}</td><td>{pct(item.attendance_rate)}</td><td>{item.waitlisted}</td><td>{item.unique_clients}</td><td>{item.repeat_clients}</td>
        </tr>)}</tbody>
      </table></div>
      {!summary.length && <p className="mt-4 text-sm text-cream-dim">No non-cancelled past class dates in this window.</p>}
    </section>
    <section className="rounded-3xl border border-divider bg-white p-5">
      <h2 className="text-lg font-semibold text-cream">By recurring time slot</h2>
      <p className="mt-1 text-xs leading-5 text-cream-dim">Historical evidence grouped by Pacific weekday and hour. This does not recommend a schedule change.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{timeSlots.map(slot => <article key={slot.weekday + ":" + slot.hour} className="rounded-xl bg-surface-soft p-3">
        <h3 className="text-sm font-semibold text-cream">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][slot.weekday]} · {slot.hour % 12 || 12} {slot.hour < 12 ? "AM" : "PM"}</h3>
        <p className="mt-2 text-xs text-cream-dim">{slot.occurrences} class dates · {pct(slot.fill_rate)} fill · {slot.attended} attended · {slot.waitlisted} waitlist records</p>
      </article>)}</div>
    </section>
    <aside className="rounded-2xl border border-sky/20 bg-sky/5 p-5">
      <h2 className="font-semibold text-cream">Decision boundary</h2>
      <p className="mt-2 text-sm leading-6 text-cream-dim">Fill rate uses booked/attended/no-show seats divided by recorded capacity. Attendance rate uses attended versus attended + no-show only. Unique and repeat counts include those booked statuses, not just verified attendance. Waitlist records do not prove future demand. These metrics do not calculate revenue, class credits or instructor compensation.</p>
      <div className="mt-2 flex flex-wrap gap-4"><Link href="/classes/manage" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Class operations →</Link><Link href="/classes/manage/launch" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Owner launch control →</Link></div>
    </aside>
  </div></AppShell>;
}
