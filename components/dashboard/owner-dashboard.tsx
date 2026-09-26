import { DollarSign, Users, TrendingUp, UserPlus, Activity, Inbox, Target, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StudioHero } from "@/components/dashboard/studio-hero";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { findLowBalancePackages } from "@/lib/queries/low-balance";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { loadStaffUnreadMessages } from "@/lib/messages/actionable";

export async function OwnerDashboard({ fullName }: { fullName: string }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile, error: profileError } = await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if (profileError || profile?.role !== "owner" || profile.deleted_at) return null;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
  const [summaryQ, joinedQ, rosterQ, cohortQ, retainedQ, failedQ, growth, unread, lowBalance] = await Promise.all([
    db.from("client_billing_summary").select("client_id,full_name,status,billing_type,total_monthly_cents,active_subscriptions_count,active_packages_count,last_session_at,primary_plan_label"),
    db.from("clients").select("*", { count:"exact",head:true }).eq("status","active").gte("joined_at",startOfMonth),
    db.from("client_billing_summary").select("client_id,full_name,status,primary_plan_label").order("full_name").limit(8),
    db.from("clients").select("*", { count:"exact",head:true }).lte("joined_at",ninetyDaysAgo),
    db.from("clients").select("*", { count:"exact",head:true }).lte("joined_at",ninetyDaysAgo).eq("status","active"),
    db.from("payments").select("*", { count:"exact",head:true }).eq("status","failed"),
    loadLeadWorkspace(db), loadStaffUnreadMessages(db), findLowBalancePackages(2),
  ]);
  if ([summaryQ,joinedQ,rosterQ,cohortQ,retainedQ,failedQ].some(result => result.error)) throw new Error("Business overview is unavailable. Refresh to retry.");
  const allClients = summaryQ.data ?? [];
  const activeClients = allClients.filter(client => client.status === "active");
  const mrr = activeClients.reduce((sum,client) => sum + (client.total_monthly_cents ?? 0),0);
  const atRisk = activeClients.filter(client => !client.last_session_at || client.last_session_at < fourteenDaysAgo).slice(0,5);
  const conversion = growth.pipeline.length ? Math.round(growth.converted.length / growth.pipeline.length * 100) : null;
  const retention = cohortQ.count ? Math.round((retainedQ.count ?? 0) / cohortQ.count * 100) : null;
  const newLeads = growth.pipeline.filter(lead => lead.created_at >= startOfMonth).length;
  const stages = [
    { name:"New",count:growth.open.filter(lead => lead.stage === "new").length },
    { name:"Contacted / nurturing",count:growth.open.filter(lead => ["contacted","nurturing"].includes(lead.stage)).length },
    { name:"Booked",count:growth.booked.length }, { name:"Converted",count:growth.converted.length },
  ];
  const max = Math.max(1,...stages.map(stage => stage.count));
  const hour = Number(new Intl.DateTimeFormat("en-US",{ hour:"numeric",hour12:false,timeZone:"America/Los_Angeles" }).format(now));
  return <div className="flex flex-col gap-6">
    <StudioHero greeting={`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${fullName.split(" ")[0]}`} subline="Here is what needs attention at IMS."/>
    <div className="grid grid-cols-3 gap-3"><Link href="/messages" className="rounded-2xl border border-divider bg-white p-4"><Inbox className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{unread.length}</p><p className="text-xs text-cream-faint">Incoming unread messages</p></Link><Link href="/leads" className="rounded-2xl border border-divider bg-white p-4"><Target className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{growth.untouched.length}</p><p className="text-xs text-cream-faint">New inquiries need first contact</p></Link><Link href="/reports/operations" className="rounded-2xl border border-divider bg-white p-4"><ShieldAlert className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{(failedQ.count ?? 0) + lowBalance.length}</p><p className="text-xs text-cream-faint">Billing/package actions</p></Link></div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6"><KpiCard label="MRR" value={mrr > 0 ? formatCurrency(mrr) : "—"} icon={DollarSign} hint={mrr === 0 ? "no active subs yet" : `${activeClients.length} active`}/><KpiCard label="Active" value={String(activeClients.length)} icon={Users} hint="status = active"/><KpiCard label="New Members" value={String(joinedQ.count ?? 0)} icon={UserPlus} hint="joined this month"/><KpiCard label="New Inquiries" value={String(newLeads)} icon={UserPlus} hint="added this month"/><KpiCard label="Conversion" value={conversion === null ? "—" : `${conversion}%`} icon={TrendingUp} hint="current inquiry sources"/><KpiCard label="90-day Retention" value={retention === null ? "—" : `${retention}%`} icon={Activity} hint={retention === null ? "needs more data" : `${retainedQ.count}/${cohortQ.count}`}/></div>
    <Card><CardHeader><CardTitle>New business pipeline</CardTitle><CardDescription>Current inquiries → contacted → booked → client</CardDescription></CardHeader><CardContent><div className="space-y-3">{stages.map(stage => <div key={stage.name} className="flex items-center gap-3"><p className="w-28 shrink-0 text-xs text-cream-dim sm:w-44 sm:text-sm">{stage.name}</p><div className="h-5 flex-1 overflow-hidden rounded-full bg-surface"><div className="h-full bg-sky" style={{width:`${stage.count / max * 100}%`}}/></div><span className="w-8 text-right text-sm font-semibold text-cream">{stage.count}</span></div>)}</div><p className="mt-4 text-xs leading-5 text-cream-faint">{growth.contacts.length} historical contacts and {growth.research.length} research candidates are excluded. <Link href="/contacts" className="font-semibold text-sky">Open Contacts →</Link></p></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle>Clients going quiet</CardTitle><CardDescription>14+ days since a recorded session</CardDescription></CardHeader><CardContent>{atRisk.length ? <ul className="space-y-3">{atRisk.map(client => <li key={client.client_id} className="flex items-start justify-between gap-2 text-sm"><Link href={`/clients/${client.client_id}`} className="truncate font-medium text-cream">{client.full_name}</Link><Badge tone="limited">{client.last_session_at ? `${Math.round((now.getTime() - new Date(client.last_session_at).getTime())/86400000)}d` : "No record"}</Badge></li>)}</ul> : <p className="text-sm text-cream-dim">No clients currently flagged.</p>}</CardContent></Card>
    <Card className="lg:col-span-2"><CardHeader><CardTitle>Package renewals</CardTitle><CardDescription>Packages at two sessions or fewer</CardDescription></CardHeader><CardContent>{lowBalance.length ? <ul className="space-y-3">{lowBalance.slice(0,6).map((client,index) => <li key={`${client.clientId}:${index}`} className="flex flex-wrap items-center justify-between gap-2 text-sm"><Link href={`/clients/${client.clientId}`} className="font-medium text-cream">{client.name}</Link><div className="flex items-center gap-2"><span className="text-xs text-cream-faint">{client.planLabel}</span><Badge tone={client.state === "depleted" ? "limited" : "moderate"}>{client.state === "depleted" ? "Depleted" : `${client.remaining} left`}</Badge></div></li>)}</ul> : <p className="text-sm text-cream-dim">No packages are currently flagged as low.</p>}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>Client roster</CardTitle><CardDescription>{allClients.length} loaded client summaries · <Link href="/clients" className="text-sky">View all clients</Link></CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(rosterQ.data ?? []).map(client => <Link key={client.client_id} href={`/clients/${client.client_id}`} className="rounded-xl border border-divider p-3"><p className="truncate text-sm font-semibold text-cream">{client.full_name}</p><p className="mt-1 truncate text-xs text-cream-faint">{client.primary_plan_label ?? "No plan label"}</p></Link>)}</div></CardContent></Card>
  </div>;
}
