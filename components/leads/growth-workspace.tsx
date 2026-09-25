import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { LeadWorkspaceView } from "@/components/leads/lead-workspace-view";
import { LeadResearchDesk } from "@/components/leads/lead-research-desk";
import { Search,UsersRound,Target,ArrowRight } from "lucide-react";

export async function GrowthWorkspace({ mode = "pipeline" }: { mode?: "pipeline" | "contacts" | "research" }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/leads");
  const { data: me, error: authError } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (authError || !me || me.deleted_at || !["owner","trainer"].includes(me.role)) redirect("/dashboard");
  let workspace;
  try { workspace = await loadLeadWorkspace(db); } catch { return <AppShell><main className="mx-auto max-w-6xl space-y-5"><h1 className="text-3xl font-bold">Growth & contacts</h1><p role="alert" className="rounded-2xl border border-status-limited p-5">This workspace could not be loaded. Existing records have not been changed. Refresh to retry.</p></main></AppShell>; }
  const title = mode === "contacts" ? "Your existing contacts" : mode === "research" ? "Find new opportunities" : "New business";
  const description = mode === "contacts" ? "Past clients, friends and historical imports are preserved here—not automatically treated as people who want to buy training today." : mode === "research" ? "Source-backed research first. Qualification and outreach are deliberate owner decisions, not assumptions made by an agent." : "A clean pipeline for current inquiries and referrals. Your historical contact list is separate, so imported records do not inflate sales activity.";
  const rows = mode === "contacts" ? workspace.contacts : mode === "research" ? workspace.research : workspace.pipeline;
  rows.sort((a,b) => mode === "contacts" ? a.full_name.localeCompare(b.full_name) : b.updated_at.localeCompare(a.updated_at));
  return <AppShell><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">IMS / Relationships & growth</p><h1 className="mt-2 text-4xl font-bold">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">{description}</p></header>
    {mode === "pipeline" && <section className="grid gap-3 sm:grid-cols-3"><Link href="/leads/research" className="rounded-2xl border border-sky/30 bg-sky/5 p-5"><Search className="h-5 w-5 text-sky"/><p className="mt-3 font-semibold text-cream">Research Desk</p><p className="mt-1 text-xs leading-5 text-cream-dim">Find source-backed partner channels and qualified acquisition opportunities.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky">Open research <ArrowRight className="h-3 w-3"/></span></Link><div className="rounded-2xl border border-divider bg-white p-5"><UsersRound className="h-5 w-5 text-sky"/><p className="mt-3 font-semibold text-cream">General-population clients</p><p className="mt-1 text-xs leading-5 text-cream-dim">Keep the pipeline broad: strength, mobility, weight management, active aging and return-to-training.</p></div><div className="rounded-2xl border border-divider bg-white p-5"><Target className="h-5 w-5 text-sky"/><p className="mt-3 font-semibold text-cream">Premium-fit segment</p><p className="mt-1 text-xs leading-5 text-cream-dim">Prioritize channels likely to reach adults 35+ who value private coaching, longevity and measurable performance.</p></div></section>}
    <nav aria-label="Growth workspaces" className="flex flex-wrap gap-2">{[{key:"pipeline",href:"/leads",label:"New business",count:workspace.pipeline.length},{key:"contacts",href:"/contacts",label:"Contacts",count:workspace.contacts.length},{key:"research",href:"/leads/research",label:"Research desk",count:workspace.research.length}].map(tab => <Link key={tab.key} href={tab.href} aria-current={mode === tab.key ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${mode === tab.key ? "border-sky bg-sky text-white" : "border-divider bg-white text-cream"}`}>{tab.label}<span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{tab.count}</span></Link>)}</nav>
    {mode === "pipeline" && <section aria-label="Current inquiry health" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{label:"Open inquiries",value:workspace.open.length},{label:"Needs first contact",value:workspace.untouched.length},{label:"Booked",value:workspace.booked.length},{label:"Converted",value:workspace.converted.length}].map(metric => <div key={metric.label} className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs text-cream-faint">{metric.label}</p><p className="mt-2 text-3xl font-bold text-cream">{metric.value}</p></div>)}</section>}
    {mode === "research" && <LeadResearchDesk/>}
    <LeadWorkspaceView key={`${mode}:${rows.map(row => row.updated_at).join(",")}`} rows={rows} contacts={mode === "contacts"} research={mode === "research"}/>
    <p className="text-xs leading-5 text-cream-faint">Source labels and original contact histories are preserved. Research matches do not prove interest, consent or purchase intent. This view does not send messages or create client accounts.</p>
  </main></AppShell>;
}
