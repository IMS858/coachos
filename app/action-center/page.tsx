import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Target, CreditCard, PackageSearch, Dumbbell, UserRoundCheck, ArrowRight, CalendarCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { findLowBalancePackages } from "@/lib/queries/low-balance";

export const dynamic = "force-dynamic";

export default async function ActionCenterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/action-center");
  const { data: me } = await supabase.from("profiles").select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "owner" || me.deleted_at) redirect("/dashboard");

  const svc = createServiceClient();
  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
  const fourteenDaysAgoIso = fourteenDaysAgo.toISOString();
  const [messagesQ, leadsQ, paymentsQ, programsQ, clientsQ, requestsQ, lowBalance] = await Promise.all([
    svc.from("messages").select("id,client_id,body,created_at,sender_id").is("read_at", null).order("created_at", { ascending: false }).limit(20),
    svc.from("leads").select("id,full_name,interest,source,stage,last_contacted_at,updated_at").in("stage", ["new","contacted","nurturing"]).is("last_contacted_at", null).order("updated_at", { ascending: false }).limit(20),
    svc.from("payments").select("id,client_id,status,amount_cents,description,paid_at").in("status", ["failed","pending"]).order("paid_at", { ascending: false }).limit(20),
    svc.from("programs").select("id,client_id,status,updated_at,data").eq("status", "draft").order("updated_at", { ascending: false }).limit(20),
    svc.from("client_billing_summary").select("client_id,full_name,status,last_session_at").eq("status", "active").or(`last_session_at.is.null,last_session_at.lt.${fourteenDaysAgoIso}`).limit(20),
    svc.from("sessions").select("id,client_id,scheduled_at,session_type,notes_pre").eq("status","requested").order("scheduled_at",{ascending:true}).limit(20),
    findLowBalancePackages(2),
  ]);
  if (messagesQ.error || leadsQ.error || paymentsQ.error || programsQ.error || clientsQ.error || requestsQ.error) throw new Error("Owner action center source unavailable");

  const messages=messagesQ.data??[], leads=leadsQ.data??[], payments=paymentsQ.data??[], programs=programsQ.data??[], quiet=clientsQ.data??[], requests=requestsQ.data??[];
  const requestIds=[...new Set(requests.map((r:any)=>r.client_id))];
  const {data:requestProfiles}=requestIds.length?await svc.from("profiles").select("id,full_name").in("id",requestIds):{data:[] as any[]};
  const requestNames=new Map((requestProfiles??[]).map((p:any)=>[p.id,p.full_name]));
  const total=messages.length+leads.length+payments.length+programs.length+quiet.length+lowBalance.length+requests.length;

  return <AppShell expectedRole="owner"><div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
    <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Owner action center</p><div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">What needs attention</h1><p className="mt-2 text-sm text-white/75">Signals from across IMS, routed to the place where you resolve them.</p></div><div className="hidden text-right sm:block"><p className="text-4xl font-bold">{total}</p><p className="text-xs text-white/60">loaded actions</p></div></div></div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {[
        ["/schedule","Booking requests",requests.length,CalendarCheck],
        ["/messages","Unread",messages.length,Inbox],
        ["/leads","First touch",leads.length,Target],
        ["/reports/operations","Payments",payments.length,CreditCard],
        ["/clients","Renewals",lowBalance.length,PackageSearch],
        ["/programs","Draft programs",programs.length,Dumbbell],
        ["/clients","Quiet clients",quiet.length,UserRoundCheck],
      ].map(([href,label,count,Icon]:any)=><Link key={label} href={href} className="rounded-2xl border border-divider bg-white p-4 transition hover:border-sky/50"><Icon className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{count}</p><p className="text-xs text-cream-faint">{label}</p></Link>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Queue title="Booking requests" href="/schedule" empty="No pending session requests." rows={requests.map((r:any)=>({key:r.id,title:requestNames.get(r.client_id)??"Client",meta:`${new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(r.scheduled_at))} · ${String(r.session_type).replaceAll("_"," ")}`,href:"/schedule"}))}/>
      <Queue title="Unread communications" href="/messages" empty="Inbox is clear." rows={messages.map((m:any)=>({key:m.id,title:(m.body||"New client message").slice(0,72),meta:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(m.created_at)),href:`/messages/${m.client_id}`}))}/>
      <Queue title="Leads needing first touch" href="/leads" empty="No untouched leads." rows={leads.map((l:any)=>({key:l.id,title:l.full_name,meta:(l.interest||l.source||"Inquiry").replaceAll("_"," "),href:"/leads"}))}/>
      <Queue title="Package renewals" href="/clients" empty="No packages at two sessions or fewer." rows={lowBalance.slice(0,20).map((p:any)=>({key:p.clientId,title:p.name,meta:p.state==="depleted"?"Depleted":`${p.remaining} sessions left`,href:`/clients/${p.clientId}`}))}/>
      <Queue title="Payment exceptions" href="/reports/operations" empty="No failed or pending payments." rows={payments.map((p:any)=>({key:p.id,title:p.description||"IMS payment",meta:p.status,href:`/clients/${p.client_id}`}))}/>
      <Queue title="Programs awaiting work" href="/programs" empty="No draft programs." rows={programs.map((p:any)=>({key:p.id,title:p.data?.client_name||"Draft program",meta:p.data?.review_status ? String(p.data.review_status).replaceAll("_"," ") : "Draft",href:`/programs/${p.id}`}))}/>
      <Queue title="Clients going quiet" href="/clients" empty="No active clients are currently flagged." rows={quiet.map((q:any)=>({key:q.client_id,title:q.full_name,meta:q.last_session_at?"14+ days since session":"No completed session recorded",href:`/clients/${q.client_id}`}))}/>
    </div>
    <p className="text-xs text-cream-faint">Action Center is an operational queue, not a historical report. Each section is intentionally capped at 20 records; Reports remains the place for analysis.</p>
  </div></AppShell>;
}

function Queue({title,href,empty,rows}:{title:string;href:string;empty:string;rows:{key:string;title:string;meta:string;href:string}[]}) {
  return <section className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm"><div className="flex items-center justify-between border-b border-divider px-5 py-4"><h2 className="font-semibold text-cream">{title}</h2><Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-sky">View all <ArrowRight className="h-3 w-3"/></Link></div>{rows.length===0?<p className="p-5 text-sm text-cream-faint">{empty}</p>:<div className="divide-y divide-divider">{rows.map(r=><Link key={r.key} href={r.href} className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-navy-elev"><p className="min-w-0 truncate text-sm font-medium text-cream">{r.title}</p><p className="shrink-0 text-xs capitalize text-cream-faint">{r.meta}</p></Link>)}</div>}</section>;
}
