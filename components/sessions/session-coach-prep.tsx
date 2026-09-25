import Link from "next/link";
import {ArrowRight,CalendarCheck,Dumbbell,History} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {buildCoachActions,coachingMode} from "@/lib/coaching/intelligence";
import {isExerciseSet} from "@/lib/exercises/catalog";

export async function SessionCoachPrep({clientId,scheduledAt}:{clientId:string;scheduledAt:string}){
 const db=await createClient();
 const [plansQ,lastQ,assessQ,programsQ]=await Promise.all([
  db.from("plans").select("kind,total_sessions,sessions_used,status").eq("client_id",clientId).eq("status","active"),
  db.from("sessions").select("id,scheduled_at,completed_at").eq("client_id",clientId).eq("status","completed").lt("scheduled_at",scheduledAt).order("scheduled_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("assessments").select("id,status,assessment_date").eq("client_id",clientId).order("assessment_date",{ascending:false}).limit(1).maybeSingle(),
  db.from("programs").select("id,status,data").eq("client_id",clientId).order("updated_at",{ascending:false}).limit(200),
 ]);
 if([plansQ,lastQ,assessQ,programsQ].some(q=>q.error))return <section className="rounded-2xl border border-status-limited/30 bg-white p-4"><p role="alert" className="text-sm text-status-limited">Session coaching context could not be loaded. No prep recommendation was inferred.</p></section>;
 const packages=(plansQ.data??[]).filter(p=>p.kind==="package");
 const remaining=packages.length?Math.min(...packages.map(p=>Math.max(0,Number(p.total_sessions??0)-Number(p.sessions_used??0)))):null;
 const programs=programsQ.data??[],sets=programs.filter(p=>isExerciseSet(p.data)),real=programs.filter(p=>!isExerciseSet(p.data));
 const input={now:new Date().toISOString(),packageRemaining:remaining,nextSessionAt:scheduledAt,lastCompletedAt:lastQ.data?.completed_at??lastQ.data?.scheduled_at??null,latestAssessmentAt:assessQ.data?.assessment_date??null,assessmentStatus:assessQ.data?.status??null,draftPrograms:real.filter(p=>p.status==="draft").length,activePrograms:real.filter(p=>["published","active"].includes(p.status)).length,savedExerciseSets:sets.length};
 const actions=buildCoachActions(clientId,input).filter(a=>a.key!=="steady").slice(0,2),mode=coachingMode(input);
 const fmt=(v:string|null)=>v?new Date(v).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"}):"—";
 return <section className="rounded-3xl border border-sky/20 bg-gradient-to-br from-white via-white to-sky/5 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-sky">Pre-session brief</p><h2 className="mt-1 text-xl font-semibold text-cream">Coach context before they walk in</h2><p className="mt-1 text-xs leading-5 text-cream-dim">Pulled from recorded IMS coaching evidence—not generated assumptions.</p></div><Link href={`/clients/${clientId}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-sky">Full client history <ArrowRight className="h-4 w-4"/></Link></div>
 <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl bg-white p-3 ring-1 ring-divider"><CalendarCheck className="h-4 w-4 text-sky"/><p className="mt-2 text-xs text-cream-faint">Mode</p><p className="mt-1 text-sm font-semibold text-cream">{mode}</p></div><div className="rounded-xl bg-white p-3 ring-1 ring-divider"><History className="h-4 w-4 text-sky"/><p className="mt-2 text-xs text-cream-faint">Previous session</p><p className="mt-1 text-sm font-semibold text-cream">{fmt(input.lastCompletedAt)}</p></div><div className="rounded-xl bg-white p-3 ring-1 ring-divider"><Dumbbell className="h-4 w-4 text-sky"/><p className="mt-2 text-xs text-cream-faint">Programming</p><p className="mt-1 text-sm font-semibold text-cream">{input.activePrograms?input.activePrograms+" active":input.draftPrograms?input.draftPrograms+" draft":"No active program"}</p></div><div className="rounded-xl bg-white p-3 ring-1 ring-divider"><CalendarCheck className="h-4 w-4 text-sky"/><p className="mt-2 text-xs text-cream-faint">Package</p><p className="mt-1 text-sm font-semibold text-cream">{remaining===null?"No active package":remaining+" left"}</p></div></div>
 {actions.length>0&&<div className="mt-4 flex flex-wrap gap-2">{actions.map(a=><Link key={a.key} href={a.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-white px-3 text-xs font-semibold text-cream">{a.label}<ArrowRight className="h-3.5 w-3.5 text-sky"/></Link>)}</div>}
 </section>;
}
