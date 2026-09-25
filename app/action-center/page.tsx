import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Target, CreditCard, PackageSearch, Dumbbell, UserRoundCheck, ArrowRight, CalendarCheck, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { findLowBalancePackages } from "@/lib/queries/low-balance";
import { loadLeadWorkspace } from "@/lib/leads/queries";
import { loadStaffUnreadMessages } from "@/lib/messages/actionable";

export const dynamic = "force-dynamic";

type Row = { key:string; title:string; meta:string; href:string };
function Queue({title,href,empty,rows}:{title:string;href:string;empty:string;rows:Row[]}) {
  return <section className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4"><h2 className="font-semibold text-cream">{title}</h2><Link href={href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-sky">View all <ArrowRight className="h-3 w-3"/></Link></div>
    {rows.length ? <div className="divide-y divide-divider">{rows.map(row => <Link key={row.key} href={row.href} className="block px-5 py-3 transition hover:bg-sky/[0.035]"><p className="truncate text-sm font-semibold text-cream">{row.title}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-cream-dim">{row.meta}</p></Link>)}</div> : <p className="p-5 text-sm leading-6 text-cream-dim">{empty}</p>}
  </section>;
}

export default async function ActionCenterPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/action-center");

  const { data: me, error: profileError } = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profileError || !me || me.deleted_at || !["owner","trainer"].includes(me.role)) redirect("/dashboard");
  const isOwner = me.role === "owner";
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();

  const assignedClientsQ = isOwner
    ? db.from("clients").select("id,primary_trainer_id,status,last_session_at")
    : db.from("clients").select("id,primary_trainer_id,status,last_session_at").eq("primary_trainer_id", user.id);
  const [assignedClients, unread, programsQ, requestsQ] = await Promise.all([
    assignedClientsQ,
    loadStaffUnreadMessages(db),
    db.from("programs").select("id,name,client_id,status,trainer_id,data,updated_at").eq("status","draft").or("data->>source.is.null,data->>source.neq.ims_exercise_set").order("updated_at",{ascending:false}).limit(100),
    db.from("sessions").select("id,client_id,trainer_id,scheduled_at,session_type").eq("status","requested").order("scheduled_at").limit(100),
  ]);
  if (assignedClients.error || programsQ.error || requestsQ.error) throw new Error("Action Center is unavailable. Refresh to retry.");

  const clientIds = new Set((assignedClients.data ?? []).map(row => row.id));
  const messages = unread.filter(row => isOwner || clientIds.has(row.client_id)).slice(0,20);
  const programs = (programsQ.data ?? []).filter(row => isOwner || row.trainer_id === user.id || clientIds.has(row.client_id)).slice(0,20);
  const requests = (requestsQ.data ?? []).filter(row => isOwner || row.trainer_id === user.id || clientIds.has(row.client_id)).slice(0,20);
  const quietRows = (assignedClients.data ?? []).filter(row => row.status === "active" && (!row.last_session_at || row.last_session_at < fourteenDaysAgo)).slice(0,20);

  const nameIds = [...new Set([...requests.map(row => row.client_id), ...messages.map(row => row.client_id), ...programs.map(row => row.client_id), ...quietRows.map(row => row.id)])];
  const namesQ = nameIds.length ? await db.from("profiles").select("id,full_name").in("id", nameIds) : { data: [], error: null };
  if (namesQ.error) throw new Error("Client names could not be loaded.");
  const names = new Map((namesQ.data ?? []).map(row => [row.id,row.full_name]));
  const date = (value:string) => new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value));

  if (!isOwner) {
    const total = messages.length + programs.length + requests.length + quietRows.length;
    const cards = [
      {href:"/schedule",label:"Booking requests",count:requests.length,icon:CalendarCheck},
      {href:"/messages",label:"Unread messages",count:messages.length,icon:Inbox},
      {href:"/programs",label:"Draft programs",count:programs.length,icon:Dumbbell},
      {href:"/clients",label:"Quiet clients",count:quietRows.length,icon:UserRoundCheck},
    ];
    return <AppShell><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
      <header className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Coach action center</p><div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">What needs handling</h1><p className="mt-2 text-sm text-white/80">Your clients, your programs, your messages and training requests—without owner finance noise.</p></div><div className="hidden text-right sm:block"><p className="text-4xl font-bold">{total}</p><p className="text-xs text-white/65">coaching actions</p></div></div></header>
      <section aria-label="Coach action queues" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(card=>{const Icon=card.icon;return <Link key={card.label} href={card.href} className="rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50"><Icon className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{card.count}</p><p className="text-xs text-cream-faint">{card.label}</p></Link>})}</section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Queue title="Booking requests" href="/schedule" empty="No pending training requests for your clients." rows={requests.map(row=>({key:row.id,title:names.get(row.client_id)??"Client",meta:date(row.scheduled_at),href:"/schedule"}))}/>
        <Queue title="Unread communications" href="/messages" empty="No incoming messages need your attention." rows={messages.map(row=>({key:row.id,title:names.get(row.client_id)??"Client message",meta:row.body.slice(0,90),href:`/messages/${row.client_id}`}))}/>
        <Queue title="Programs awaiting work" href="/programs" empty="No draft programs need your attention." rows={programs.map(row=>({key:row.id,title:row.name||"Draft program",meta:names.get(row.client_id)??"Client",href:`/programs/${row.id}`}))}/>
        <Queue title="Clients going quiet" href="/clients" empty="No assigned active clients are currently flagged." rows={quietRows.map(row=>({key:row.id,title:names.get(row.id)??"Client",meta:row.last_session_at?"14+ days since recorded session":"No completed session recorded",href:`/clients/${row.id}`}))}/>
      </div>
    </main></AppShell>;
  }

  const [growth,paymentsQ,packages] = await Promise.all([
    loadLeadWorkspace(db),
    db.from("payments").select("id,client_id,status,description").in("status",["failed","pending"]).order("paid_at",{ascending:false}).limit(20),
    findLowBalancePackages(2),
  ]);
  if (paymentsQ.error) throw new Error("Owner billing actions are unavailable. Refresh to retry.");
  const leads = growth.untouched.slice(0,20), payments = paymentsQ.data ?? [], lowBalance = packages.slice(0,20);
  const total = messages.length + leads.length + payments.length + programs.length + quietRows.length + lowBalance.length + requests.length;
  const cards = [
    {href:"/schedule",label:"Booking requests",count:requests.length,icon:CalendarCheck},
    {href:"/messages",label:"Incoming unread",count:messages.length,icon:Inbox},
    {href:"/leads",label:"First contact",count:leads.length,icon:Target},
    {href:"/reports/operations",label:"Payments",count:payments.length,icon:CreditCard},
    {href:"/clients",label:"Renewals",count:lowBalance.length,icon:PackageSearch},
    {href:"/programs",label:"Draft programs",count:programs.length,icon:Dumbbell},
    {href:"/clients",label:"Quiet clients",count:quietRows.length,icon:UserRoundCheck},
  ];
  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
    <header className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Owner action center</p><div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-4xl font-bold">What needs attention</h1><p className="mt-2 text-sm text-white/80">Current client work and real business exceptions, connected to their next action.</p></div><div className="hidden text-right sm:block"><p className="text-4xl font-bold">{total}</p><p className="text-xs text-white/65">loaded actions</p></div></div></header>
    <section aria-label="Owner action queues" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{cards.map(card=>{const Icon=card.icon;return <Link key={card.label} href={card.href} className="rounded-2xl border border-divider bg-white p-4 transition hover:border-sky/50"><Icon className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{card.count}</p><p className="text-xs text-cream-faint">{card.label}</p></Link>})}</section>
    <div className="grid gap-4 lg:grid-cols-2">
      <Queue title="Booking requests" href="/schedule" empty="No pending training requests." rows={requests.map(row=>({key:row.id,title:names.get(row.client_id)??"Client",meta:date(row.scheduled_at),href:"/schedule"}))}/>
      <Queue title="Unread communications" href="/messages" empty="No incoming messages need attention." rows={messages.map(row=>({key:row.id,title:names.get(row.client_id)??"Client message",meta:row.body.slice(0,90),href:`/messages/${row.client_id}`}))}/>
      <Queue title="New inquiries needing first contact" href="/leads" empty="No current inquiries need first contact. Historical contacts are separate." rows={leads.map(row=>({key:row.id,title:row.full_name,meta:row.interest??"Current inquiry",href:"/leads"}))}/>
      <Queue title="Package renewals" href="/clients" empty="No packages currently flagged as low." rows={lowBalance.map((row,index)=>({key:`${row.clientId}:${index}`,title:row.name,meta:row.state==="depleted"?"Depleted":`${row.remaining} sessions left`,href:`/clients/${row.clientId}`}))}/>
      <Queue title="Payment exceptions" href="/reports/operations" empty="No failed or pending payments." rows={payments.map(row=>({key:row.id,title:row.description||"IMS payment",meta:row.status,href:row.client_id?`/clients/${row.client_id}`:"/reports/operations"}))}/>
      <Queue title="Programs awaiting work" href="/programs" empty="No draft programs. Exercise sets remain on client profiles." rows={programs.map(row=>({key:row.id,title:row.name||"Draft program",meta:names.get(row.client_id)??"Client",href:`/programs/${row.id}`}))}/>
      <Queue title="Clients going quiet" href="/clients" empty="No active clients currently flagged." rows={quietRows.map(row=>({key:row.id,title:names.get(row.id)??"Client",meta:row.last_session_at?"14+ days since recorded session":"No completed session recorded",href:`/clients/${row.id}`}))}/>
    </div>
    <p className="text-xs leading-5 text-cream-faint">Historical contacts, unqualified research and saved exercise selections do not inflate action counts. <Link href="/contacts" className="font-semibold text-sky">Contacts</Link> · <Link href="/leads/research" className="font-semibold text-sky">Research desk</Link></p>
  </main></AppShell>;
}
