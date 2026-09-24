import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";

export const dynamic="force-dynamic";
const TZ="America/Los_Angeles";
function dayInPt(date:Date){return new Intl.DateTimeFormat("en-CA",{timeZone:TZ}).format(date);}
function shiftDay(ymd:string,days:number){const d=new Date(ymd+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function offset(ymd:string){const parts=new Intl.DateTimeFormat("en-US",{timeZone:TZ,timeZoneName:"longOffset"}).formatToParts(new Date(ymd+"T12:00:00Z"));return parts.find(p=>p.type==="timeZoneName")?.value.replace("GMT","")??"-08:00";}
function clock(iso:string){return new Intl.DateTimeFormat("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit"}).format(new Date(iso));}
function title(ymd:string){return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"long",month:"long",day:"numeric"}).format(new Date(ymd+"T12:00:00Z"));}
export default async function ScheduleAgenda({searchParams}:{searchParams:Promise<{date?:string;trainer?:string}>}){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect("/login?next=/schedule/agenda");
 const {data:viewer}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
 if(!viewer||!["owner","trainer"].includes(viewer.role))redirect("/dashboard");
 const params=await searchParams;
 const today=dayInPt(new Date());
 const selected=params.date&&/^\d{4}-\d{2}-\d{2}$/.test(params.date)&&!Number.isNaN(Date.parse(params.date+"T12:00:00Z"))?params.date:today;
 const next=shiftDay(selected,1);
 const [{data:sessions,error:sessionError},{data:staff,error:staffError}]=await Promise.all([
  supabase.from("sessions").select("id,client_id,trainer_id,scheduled_at,duration_minutes,session_type,status")
   .gte("scheduled_at",selected+"T00:00:00"+offset(selected))
   .lt("scheduled_at",next+"T00:00:00"+offset(next))
   .neq("status","cancelled").order("scheduled_at").limit(500),
  supabase.from("profiles").select("id,full_name,role").in("role",["owner","trainer"]).order("full_name")
 ]);
 const trainerIds=new Set((staff??[]).map(t=>t.id));
 const trainerFilter=params.trainer&&trainerIds.has(params.trainer)?params.trainer:"all";
 const visible=(sessions??[]).filter(s=>trainerFilter==="all"||s.trainer_id===trainerFilter);
 const ids=[...new Set(visible.map(s=>s.client_id).filter(Boolean))];
 const {data:clients,error:clientError}=ids.length?await supabase.from("profiles").select("id,full_name").in("id",ids):{data:[],error:null};
 const clientNames=new Map((clients??[]).map(c=>[c.id,c.full_name]));
 const trainerNames=new Map((staff??[]).map(t=>[t.id,t.full_name]));
 const filterQuery=trainerFilter==="all"?"":"&trainer="+encodeURIComponent(trainerFilter);
 const counts={total:visible.length,confirmed:visible.filter(s=>s.status==="confirmed"||s.status==="scheduled").length,requested:visible.filter(s=>s.status==="requested").length};
 return <AppShell><main className="mx-auto max-w-5xl space-y-6 pb-16">
  <header className="rounded-2xl border border-divider bg-navy-soft p-6">
   <p className="text-xs font-semibold uppercase tracking-widest text-sky">IMS / Scheduling</p>
   <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
    <div><h1 className="text-3xl font-semibold text-cream">Daily agenda</h1><p className="mt-2 text-sm text-cream-dim">{title(selected)} · Pacific time</p></div>
    <div className="flex flex-wrap gap-2">
     <Link href={`/schedule/agenda?date=${shiftDay(selected,-1)}${filterQuery}`} className="rounded-lg border border-divider px-4 py-2 text-sm text-cream">← Previous</Link>
     <Link href={`/schedule/agenda?date=${today}${filterQuery}`} className="rounded-lg border border-divider px-4 py-2 text-sm text-cream">Today</Link>
     <Link href={`/schedule/agenda?date=${next}${filterQuery}`} className="rounded-lg border border-divider px-4 py-2 text-sm text-cream">Next →</Link>
    </div>
   </div>
   <div className="mt-5 flex flex-wrap gap-2">
    <Link href={`/schedule?date=${selected}`} className="rounded-lg border border-divider px-4 py-2 text-sm text-cream">Trainer grid</Link>
    <Link href="/sessions/new" className="rounded-lg bg-sky px-4 py-2 text-sm font-semibold text-navy">+ New session</Link>
   </div>
  </header>
  <section className="grid grid-cols-3 gap-3" aria-label="Day summary">
   {[{label:"Sessions",value:counts.total},{label:"Scheduled",value:counts.confirmed},{label:"Requests",value:counts.requested}].map(item=><div key={item.label} className="rounded-xl border border-divider bg-navy-soft p-4"><p className="text-xs text-cream-dim">{item.label}</p><p className="mt-2 text-3xl font-semibold text-cream">{item.value}</p></div>)}
  </section>
  <nav aria-label="Trainer filter" className="flex flex-wrap gap-2">
   {[{id:"all",full_name:"All trainers"},...(staff??[])].map(t=><Link key={t.id} href={`/schedule/agenda?date=${selected}${t.id==="all"?"":"&trainer="+encodeURIComponent(t.id)}`}
    className={`rounded-full border px-4 py-2 text-sm ${trainerFilter===t.id?"border-sky bg-sky text-navy":"border-divider text-cream"}`}>{t.full_name}</Link>)}
  </nav>
  {sessionError||staffError||clientError?<p role="alert" className="rounded-xl border border-status-limited p-5 text-status-limited">Schedule unavailable. Please retry; no sessions were changed.</p>:
  visible.length===0?<div className="rounded-xl border border-divider bg-navy-soft p-8 text-center"><p className="text-lg font-semibold text-cream">No sessions on this agenda</p><p className="mt-2 text-sm text-cream-dim">Try another day or trainer, or create a session.</p></div>:
  <ol className="space-y-3">{visible.map(s=><li key={s.id}><Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border border-divider bg-navy-soft p-4 transition-colors hover:border-sky/60">
   <div className="w-28 shrink-0"><p className="text-base font-semibold text-cream">{clock(s.scheduled_at)}</p><p className="text-xs text-cream-dim">{s.duration_minutes??60} min</p></div>
   <div className="min-w-0 flex-1"><p className="font-semibold text-cream">{clientNames.get(s.client_id)??"Client"}</p><p className="mt-1 text-sm text-cream-dim">{trainerNames.get(s.trainer_id)??"Unassigned"} · {String(s.session_type??"Session").replace(/_/g," ")}</p></div>
   <span className="rounded-full border border-divider px-3 py-1 text-xs capitalize text-cream-dim">{s.status}</span>
  </Link></li>)}</ol>}
  <p className="text-xs text-cream-dim">This view reads live session data and does not alter booking status.</p>
 </main></AppShell>;
}
