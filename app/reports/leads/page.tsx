import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { sourceLabel } from "@/lib/leads/workspace";
export const dynamic = "force-dynamic";
export default async function LeadPipelineReport() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/reports/leads");
  const { data: me, error } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (error || me?.role !== "owner" || me.deleted_at) redirect("/dashboard");
  const workspace = await loadLeadWorkspace(db);
  const sources = new Map<string,{total:number;converted:number}>();
  for (const lead of workspace.pipeline) { const source = lead.source ?? "unknown"; const stats = sources.get(source) ?? { total:0,converted:0 }; stats.total++; if (lead.stage === "converted") stats.converted++; sources.set(source,stats); }
  const rate = workspace.pipeline.length ? Math.round(workspace.converted.length / workspace.pipeline.length * 100) : null;
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6"><Link href="/reports" className="inline-flex min-h-11 items-center text-sm text-sky">← Reports</Link><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/65">Growth</p><h1 className="mt-2 text-4xl font-bold">New business pipeline</h1><p className="mt-3 text-sm leading-6 text-white/80">Current inquiries and referrals—not a repackaged historical contact list.</p></header>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Pipeline health">{[{label:"Open inquiries",value:workspace.open.length},{label:"Booked",value:workspace.booked.length},{label:"Needs first contact",value:workspace.untouched.length},{label:"Inquiry conversion",value:rate === null ? "—" : `${rate}%`}].map(metric => <div key={metric.label} className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs text-cream-faint">{metric.label}</p><p className="mt-2 text-3xl font-bold text-cream">{metric.value}</p></div>)}</section>
    <p className="rounded-xl border border-divider bg-white p-4 text-sm leading-6 text-cream-dim">{workspace.contacts.length} historical or unclassified contacts and {workspace.research.length} research candidates are excluded from these conversion metrics. <Link href="/contacts" className="font-semibold text-sky">Open Contacts →</Link></p>
    <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Source performance</h2>{sources.size === 0 && <p className="mt-3 text-sm text-cream-dim">No current inquiry sources yet. Conversion stays unknown rather than treating old contacts as lost sales.</p>}<div className="mt-3 divide-y divide-divider">{[...sources].map(([source,stats]) => <div key={source} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium text-cream">{sourceLabel(source)}</p><p className="text-xs text-cream-faint">{stats.total} inquiries</p></div><span className="text-cream-dim">{Math.round(stats.converted / stats.total * 100)}% converted</span></div>)}</div></section><section className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-cream">First-contact queue</h2><Link href="/leads" className="min-h-11 py-3 text-xs font-semibold text-sky">Open new business →</Link></div>{workspace.untouched.length === 0 && <p className="mt-3 text-sm text-cream-dim">No current inquiries need a first contact.</p>}<div className="divide-y divide-divider">{workspace.untouched.slice(0,10).map(lead => <Link key={lead.id} href="/leads" className="block py-3"><p className="text-sm font-semibold text-cream">{lead.full_name}</p><p className="mt-1 text-xs text-cream-faint">{lead.interest ?? sourceLabel(lead.source)}</p></Link>)}</div></section></div>
  </main></AppShell>;
}
