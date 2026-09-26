import Link from "next/link";
import {redirect} from "next/navigation";
import {Users,Dumbbell,ClipboardCheck,BadgeDollarSign,History,CalendarDays,ListChecks,ArrowRight} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";

export const dynamic="force-dynamic";
export default async function OperationalReadinessPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/settings/readiness");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner"||me.data.deleted_at)redirect("/dashboard");
 const now=new Date(),future=new Date(now.getTime()+7*86400000).toISOString(),past30=new Date(now.getTime()-30*86400000).toISOString();
 const [staffQ,clientsQ,programsQ,assessQ,rulesQ,auditQ,upcomingQ,requestsQ,paymentsQ,draftsQ]=await Promise.all([
  db.from("profiles").select("id").in("role",["owner","trainer"]).is("deleted_at",null),
  db.from("clients").select("id,primary_trainer_id").eq("status","active"),
  db.from("programs").select("client_id,status").in("status",["published","active"]),
  db.from("assessments").select("client_id,status").eq("status","complete"),
  db.from("trainer_compensation_rules").select("trainer_id,active").eq("active",true),
  db.from("audit_logs").select("id",{count:"exact",head:true}).gte("created_at",past30),
  db.from("sessions").select("id",{count:"exact",head:true}).in("status",["scheduled","confirmed"]).gte("scheduled_at",now.toISOString()).lt("scheduled_at",future),
  db.from("sessions").select("id",{count:"exact",head:true}).eq("status","requested"),
  db.from("payments").select("id",{count:"exact",head:true}).in("status",["failed","pending"]),
  db.from("programs").select("id",{count:"exact",head:true}).eq("status","draft").or("data->>source.is.null,data->>source.neq.ims_exercise_set"),
 ]);
 if([staffQ,clientsQ,programsQ,assessQ,rulesQ,auditQ,upcomingQ,requestsQ,paymentsQ,draftsQ].some(q=>q.error))throw new Error("Operational readiness data could not be loaded.");
 const staff=staffQ.data??[],clients=clientsQ.data??[],activeIds=new Set(clients.map(c=>c.id));
 const assigned=clients.filter(c=>Boolean(c.primary_trainer_id)).length;
 const programmed=new Set((programsQ.data??[]).filter(p=>activeIds.has(p.client_id)).map(p=>p.client_id)).size;
 const assessed=new Set((assessQ.data??[]).filter(a=>activeIds.has(a.client_id)).map(a=>a.client_id)).size;
 const payrollReady=new Set((rulesQ.data??[]).map(r=>r.trainer_id)).size;
 const pct=(n:number,d:number)=>d?Math.round(n/d*100):0;
 const domains=[
  {title:"Staff coverage",value:staff.length+" active staff",detail:assigned+"/"+clients.length+" active clients have a primary trainer",href:"/settings/staff",icon:Users},
  {title:"Program evidence",value:programmed+"/"+clients.length+" clients",detail:pct(programmed,clients.length)+"% of active clients have a published or active program",href:"/reports/outcomes",icon:Dumbbell},
  {title:"Assessment evidence",value:assessed+"/"+clients.length+" clients",detail:pct(assessed,clients.length)+"% of active clients have a completed assessment",href:"/reports/outcomes",icon:ClipboardCheck},
  {title:"Payroll configuration",value:payrollReady+"/"+staff.length+" staff",detail:"Staff with an active explicit compensation rule",href:"/settings/payroll",icon:BadgeDollarSign},
  {title:"Operational history",value:String(auditQ.count??0)+" records",detail:"Audit records written in the last 30 days",href:"/settings/audit",icon:History},
  {title:"Forward schedule",value:String(upcomingQ.count??0)+" sessions",detail:"Scheduled or confirmed training in the next 7 days",href:"/schedule",icon:CalendarDays},
 ];
 const exceptions=(requestsQ.count??0)+(paymentsQ.count??0)+(draftsQ.count??0);
 return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
  <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-white/60">Owner control center</p><h1 className="mt-2 text-4xl font-bold">Operational Readiness</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">A factual view of whether critical IMS operations are represented in Coach OS. It is not a business valuation or certification; it shows where operating evidence exists and where process coverage is still incomplete.</p></header>
  <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{domains.map(d=>{const Icon=d.icon;return <Link key={d.title} href={d.href} className="group rounded-2xl border border-divider bg-white p-5 shadow-sm transition hover:border-sky/40"><div className="flex items-start justify-between"><span className="rounded-xl bg-sky/10 p-2.5"><Icon className="h-5 w-5 text-sky"/></span><ArrowRight className="h-4 w-4 text-cream-faint transition group-hover:translate-x-1"/></div><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-cream-faint">{d.title}</p><p className="mt-1 text-2xl font-bold text-cream">{d.value}</p><p className="mt-1 text-sm leading-6 text-cream-dim">{d.detail}</p></Link>})}</section>
  <section className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-sky/10 p-2.5"><ListChecks className="h-5 w-5 text-sky"/></span><div className="flex-1"><h2 className="font-semibold text-cream">Current operating exceptions</h2><p className="mt-1 text-sm leading-6 text-cream-dim">{exceptions} loaded exceptions across booking requests, failed/pending payments and draft programs.</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-cream-faint"><span>{requestsQ.count??0} booking requests</span><span>{paymentsQ.count??0} payment exceptions</span><span>{draftsQ.count??0} draft programs</span></div><Link href="/action-center" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-sky">Open Action Center <ArrowRight className="h-4 w-4"/></Link></div></div></section>
  <section className="rounded-2xl border border-sky/20 bg-sky/5 p-5"><h2 className="font-semibold text-cream">Operator-independence principle</h2><p className="mt-2 text-sm leading-6 text-cream-dim">The goal is not to automate judgment away. The goal is that schedules, responsibilities, client programming, outcome evidence, payroll rules and important system changes are understandable from the platform instead of living only in one person’s memory.</p></section>
 </main></AppShell>;
}