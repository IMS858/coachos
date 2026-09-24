import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Users, Clock3, CalendarCheck, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function LeadPipelineReport() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reports/leads");
  const { data: me } = await supabase.from("profiles").select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "owner" || me.deleted_at) redirect("/dashboard");
  const { data, error } = await createServiceClient().from("leads")
    .select("id, full_name, stage, source, interest, created_at, last_contacted_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Lead reporting source unavailable");
  const leads = data ?? [];
  const now = Date.now();
  const open = leads.filter((l:any) => !["converted","not_interested"].includes(l.stage));
  const converted = leads.filter((l:any) => l.stage === "converted");
  const booked = leads.filter((l:any) => l.stage === "booked");
  const stale = open.filter((l:any) => !l.last_contacted_at || now - new Date(l.last_contacted_at).getTime() > 7*86400000);
  const rate = leads.length ? Math.round(converted.length / leads.length * 100) : 0;
  const sources = new Map<string,{total:number,converted:number}>();
  for (const l of leads as any[]) { const key=l.source || "unknown"; const row=sources.get(key) || {total:0,converted:0}; row.total++; if(l.stage==="converted") row.converted++; sources.set(key,row); }
  return <AppShell expectedRole="owner"><div className="mx-auto flex max-w-5xl flex-col gap-5 py-6">
    <Link href="/reports" className="inline-flex w-fit items-center gap-1 text-sm text-cream-dim"><ArrowLeft className="h-4 w-4"/>Reports</Link>
    <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Growth</p><h1 className="mt-2 text-4xl font-bold">Lead pipeline</h1><p className="mt-2 text-sm text-white/75">Volume, follow-up health, conversion and source quality.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border border-divider bg-white p-4"><Users className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{open.length}</p><p className="text-xs text-cream-faint">Open leads</p></div>
      <div className="rounded-2xl border border-divider bg-white p-4"><CalendarCheck className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{booked.length}</p><p className="text-xs text-cream-faint">Booked</p></div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><Clock3 className="h-5 w-5 text-amber-700"/><p className="mt-3 text-3xl font-bold text-amber-900">{stale.length}</p><p className="text-xs text-amber-700">Need follow-up</p></div>
      <div className="rounded-2xl border border-divider bg-white p-4"><TrendingUp className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{rate}%</p><p className="text-xs text-cream-faint">All-time conversion</p></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Source performance</h2><div className="mt-4 divide-y divide-divider">{[...sources.entries()].sort((a,b)=>b[1].total-a[1].total).map(([source,v])=><div key={source} className="flex items-center justify-between py-3"><div><p className="text-sm font-medium capitalize text-cream">{source.replaceAll("_"," ")}</p><p className="text-xs text-cream-faint">{v.total} leads</p></div><p className="text-sm font-semibold text-cream">{v.total ? Math.round(v.converted/v.total*100) : 0}% converted</p></div>)}</div></div>
    <div className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-cream">Follow-up queue</h2><Link href="/leads" className="text-xs font-semibold text-sky">Open leads →</Link></div><div className="mt-4 divide-y divide-divider">{stale.slice(0,10).map((l:any)=><div key={l.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-cream">{l.full_name}</p><p className="text-xs capitalize text-cream-faint">{(l.interest||l.source||"lead").replaceAll("_"," ")}</p></div><p className="whitespace-nowrap text-xs text-amber-700">{l.last_contacted_at ? Math.floor((now-new Date(l.last_contacted_at).getTime())/86400000)+"d ago" : "Never touched"}</p></div>)}</div></div></div>
  </div></AppShell>;
}
