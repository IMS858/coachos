import Link from "next/link";
import {redirect} from "next/navigation";
import {Activity,ArrowRight,BadgeDollarSign,CalendarDays,ClipboardList,DollarSign,ListChecks,Target,Users} from "lucide-react";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {findLowBalancePackages} from "@/lib/queries/low-balance";
import {loadLeadWorkspace} from "@/lib/leads/queries";
import {isExerciseSet} from "@/lib/exercises/catalog";

export const dynamic="force-dynamic";
const TZ="America/Los_Angeles";
function todayBounds(){
 const now=new Date(),date=new Intl.DateTimeFormat("en-CA",{timeZone:TZ}).format(now);
 const probe=new Date(date+"T12:00:00Z"),offset=new Intl.DateTimeFormat("en-US",{timeZone:TZ,timeZoneName:"longOffset"}).formatToParts(probe).find(p=>p.type==="timeZoneName")?.value.replace("GMT","")||"-08:00";
 const start=new Date(date+"T00:00:00"+offset),end=new Date(date+"T23:59:59.999"+offset);
 return {now,date,start:start.toISOString(),end:end.toISOString(),quiet:new Date(start.getTime()-14*86400000).toISOString()};
}

function Flow({title,description,href,items}:{title:string;description:string;href:string;items:{label:string;value:string|number}[]}){
 return <Link href={href} className="group rounded-3xl border border-divider bg-white p-5 shadow-sm transition hover:border-sky/50"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-cream">{title}</h2><p className="mt-1 text-xs leading-5 text-cream-dim">{description}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-sky transition group-hover:translate-x-0.5"/></div><div className="mt-4 grid grid-cols-2 gap-2">{items.map(item=><div key={item.label} className="rounded-xl bg-surface-soft p-3"><p className="text-2xl font-bold text-cream">{item.value}</p><p className="mt-1 text-[11px] text-cream-faint">{item.label}</p></div>)}</div></Link>;
}

export default async function OperatingSystemPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/operating-system");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner"||me.data.deleted_at)redirect("/dashboard");
 const b=todayBounds();
 const [clientsQ,sessionsQ,programsQ,paymentsQ,staffQ,rulesQ,campaignsQ,reviewsQ,growth,lowPackages]=await Promise.all([
  db.from("client_billing_summary").select("client_id,status,last_session_at").eq("status","active"),
  db.from("sessions").select("id,status,trainer_id,client_id").gte("scheduled_at",b.start).lte("scheduled_at",b.end).in("status",["scheduled","confirmed","completed","requested"]),
  db.from("programs").select("id,status,data").eq("status","draft").limit(500),
  db.from("payments").select("id,status").in("status",["failed","pending"]).limit(500),
  db.from("profiles").select("id,role").in("role",["owner","trainer"]).is("deleted_at",null),
  db.from("trainer_compensation_rules").select("trainer_id,active,provider_employee_id").eq("active",true),
  db.from("growth_campaigns").select("id,status"),
  db.from("growth_opportunity_reviews").select("candidate_id,decision,due_on").neq("decision","dismiss"),
  loadLeadWorkspace(db),
  findLowBalancePackages(2),
 ]);
 if([clientsQ,sessionsQ,programsQ,paymentsQ,staffQ,rulesQ,campaignsQ,reviewsQ].some(q=>q.error))throw new Error("IMS Operating System source evidence is unavailable. No health state was inferred.");
 const activeClients=clientsQ.data??[],sessions=sessionsQ.data??[],programs=(programsQ.data??[]).filter(p=>!isExerciseSet(p.data)),payments=paymentsQ.data??[],staff=staffQ.data??[],rules=rulesQ.data??[],campaigns=campaignsQ.data??[],reviews=reviewsQ.data??[];
 const quiet=activeClients.filter(c=>!c.last_session_at||c.last_session_at<b.quiet).length;
 const todayRemaining=sessions.filter(s=>["scheduled","confirmed","requested"].includes(s.status)).length;
 const todayDone=sessions.filter(s=>s.status==="completed").length;
 const failed=payments.filter(p=>p.status==="failed").length,pending=payments.filter(p=>p.status==="pending").length;
 const mapped=new Set(rules.filter(r=>r.provider_employee_id).map(r=>r.trainer_id));
 const coaches=staff.filter(s=>["owner","trainer"].includes(s.role));
 const dueGrowth=reviews.filter(r=>r.due_on&&r.due_on<=b.date).length;
 const trackedCampaigns=campaigns.filter(c=>c.status==="tracking").length;
 return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-12">
  <header className="rounded-3xl bg-gradient-to-br from-[#121922] via-[#172536] to-[#225a80] p-6 text-white shadow-xl sm:p-8"><p className="text-[11px] font-semibold uppercase tracking-[.22em] text-white/60">Innovative Movement Solutions</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold sm:text-5xl">IMS Operating System</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">The connected state of coaching, growth, revenue operations and team delivery. Action Center handles tasks; this page shows whether the operating loops are connected.</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-right"><p className="text-2xl font-bold">{activeClients.length}</p><p className="text-xs text-white/60">active clients</p></div></div></header>
  <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="IMS operating pulse">
   <div className="rounded-2xl border border-divider bg-white p-4"><CalendarDays className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{todayRemaining}</p><p className="text-xs text-cream-faint">sessions remaining today</p><p className="mt-1 text-[11px] text-cream-dim">{todayDone} completed today</p></div>
   <div className="rounded-2xl border border-divider bg-white p-4"><Users className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{quiet}</p><p className="text-xs text-cream-faint">clients with 14d+ training gap</p></div>
   <div className="rounded-2xl border border-divider bg-white p-4"><ClipboardList className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{programs.length}</p><p className="text-xs text-cream-faint">program drafts awaiting work</p></div>
   <div className="rounded-2xl border border-divider bg-white p-4"><ListChecks className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{lowPackages.length}</p><p className="text-xs text-cream-faint">package renewal signals</p></div>
  </section>
  <section className="grid gap-4 lg:grid-cols-2">
   <Flow title="Coaching delivery loop" description="Client → evidence → program → session → follow-up." href="/clients" items={[{label:"active clients",value:activeClients.length},{label:"today sessions",value:sessions.length},{label:"draft programs",value:programs.length},{label:"quiet clients",value:quiet}]}/>
   <Flow title="Growth loop" description="Research → qualified inquiry → consultation → client → attributed receipt." href="/growth" items={[{label:"open inquiries",value:growth.open.length},{label:"booked",value:growth.booked.length},{label:"research candidates",value:growth.research.length},{label:"due growth actions",value:dueGrowth}]}/>
   <Flow title="Revenue operations" description="Package runway and payment exceptions—not an accounting statement." href="/reports/operations" items={[{label:"low packages",value:lowPackages.length},{label:"failed payments",value:failed},{label:"pending payments",value:pending},{label:"tracked campaigns",value:trackedCampaigns}]}/>
   <Flow title="Team & payroll readiness" description="People operating IMS and whether provider mappings are prepared." href="/settings/staff" items={[{label:"active staff",value:staff.length},{label:"coaches",value:coaches.length},{label:"comp rules",value:rules.length},{label:"provider mapped",value:mapped.size}]}/>
  </section>
  <section className="rounded-3xl border border-sky/20 bg-sky/5 p-5"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-5 w-5 text-sky"/><div><h2 className="font-semibold text-cream">What makes this different</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-cream-dim">Coach OS connects the reason for a coaching decision to the program, the delivered session, the client history and the business operation around it. Counts here are evidence states—not AI guesses, accounting totals or churn predictions.</p></div></div><div className="mt-4 flex flex-wrap gap-3"><Link href="/action-center" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white"><ListChecks className="h-4 w-4"/>Handle actions</Link><Link href="/growth" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-cream"><Target className="h-4 w-4 text-sky"/>Open Growth Center</Link><Link href="/reports/payroll" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-cream"><BadgeDollarSign className="h-4 w-4 text-sky"/>Payroll evidence</Link><Link href="/financials" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-cream"><DollarSign className="h-4 w-4 text-sky"/>Financials</Link></div></section>
 </main></AppShell>;
}
