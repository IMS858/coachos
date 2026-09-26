import Link from "next/link";
import {AlertTriangle,ArrowRight,CalendarDays,ClipboardCheck,Dumbbell,Sparkles} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {buildCoachActions,coachingMode} from "@/lib/coaching/intelligence";
import {isExerciseSet} from "@/lib/exercises/catalog";
import {activeTrainingPackageBalance,packageBalanceLabel} from "@/lib/plans/package-balance";

const tone={
 attention:"border-status-moderate/35 bg-status-moderate/8",
 next:"border-sky/25 bg-sky/5",
 steady:"border-divider bg-surface-soft",
} as const;

export async function ClientCoachBrief({clientId}:{clientId:string}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser(); if(!user)return null;
 const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(viewer.error||!viewer.data||viewer.data.deleted_at||!["owner","trainer"].includes(viewer.data.role))return null;
 const now=new Date().toISOString();
 const [plansQ,nextQ,lastQ,assessQ,programsQ,remoteQ]=await Promise.all([
  db.from("plans").select("id,kind,service_type,total_sessions,sessions_used,current_session_number,status").eq("client_id",clientId).eq("status","active"),
  db.from("sessions").select("id,scheduled_at").eq("client_id",clientId).in("status",["scheduled","confirmed"]).gte("scheduled_at",now).order("scheduled_at").limit(1).maybeSingle(),
  db.from("sessions").select("id,scheduled_at,completed_at").eq("client_id",clientId).eq("status","completed").order("scheduled_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("assessments").select("id,status,assessment_date").eq("client_id",clientId).order("assessment_date",{ascending:false}).limit(1).maybeSingle(),
  db.from("programs").select("id,status,data").eq("client_id",clientId).order("updated_at",{ascending:false}).limit(200),
  db.from("client_media").select("id").eq("client_id",clientId).eq("uploaded_by",clientId).limit(1),
 ]);
 if([plansQ,nextQ,lastQ,assessQ,programsQ,remoteQ].some(q=>q.error))return <section className="rounded-3xl border border-status-limited/30 bg-white p-5"><h2 className="font-semibold text-cream">Coach brief</h2><p role="alert" className="mt-2 text-sm text-status-limited">Coaching priorities could not be loaded. No action state was inferred.</p></section>;
 const packageEvidence=activeTrainingPackageBalance(plansQ.data??[]);
 const packageRemaining=packageEvidence.status==="known"?packageEvidence.remaining:null;
 const programs=programsQ.data??[],sets=programs.filter(p=>isExerciseSet(p.data)),realPrograms=programs.filter(p=>!isExerciseSet(p.data));
 const input={
  now,
  packageRemaining,
  nextSessionAt:nextQ.data?.scheduled_at??null,
  lastCompletedAt:lastQ.data?.completed_at??lastQ.data?.scheduled_at??null,
  latestAssessmentAt:assessQ.data?.assessment_date??null,
  assessmentStatus:assessQ.data?.status??null,
  draftPrograms:realPrograms.filter(p=>p.status==="draft").length,
  activePrograms:realPrograms.filter(p=>["published","active"].includes(p.status)).length,
  savedExerciseSets:sets.length,
  remoteCoachingEvidence:(remoteQ.data??[]).length>0,
 };
 const actions=buildCoachActions(clientId,input),mode=coachingMode(input);
 const facts=[
  {label:"Coaching mode",value:mode,icon:Sparkles},
  {label:"Package runway",value:packageBalanceLabel(packageEvidence),icon:CalendarDays},
  {label:"Assessment",value:input.latestAssessmentAt?new Date(input.latestAssessmentAt+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"No completed record",icon:ClipboardCheck},
  {label:"Programming",value:input.activePrograms?`${input.activePrograms} active`:input.draftPrograms?`${input.draftPrograms} draft`:input.savedExerciseSets?`${input.savedExerciseSets} saved set${input.savedExerciseSets===1?"":"s"}`:"Not started",icon:Dumbbell},
 ];
 return <section className="overflow-hidden rounded-3xl border border-sky/20 bg-white shadow-sm" aria-label="Coach intelligence">
  <div className="bg-gradient-to-br from-[#151b24] via-[#182535] to-[#1f4f73] p-5 text-white sm:p-6"><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-white/60">IMS Coach Intelligence</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">What matters next</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-white/75">A factual coaching brief assembled from this client’s schedule, package, assessment and programming records. It does not predict behavior or invent clinical conclusions.</p></div><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">{mode}</span></div></div>
  <div className="grid grid-cols-2 gap-px bg-divider lg:grid-cols-4">{facts.map(f=>{const Icon=f.icon;return <div key={f.label} className="bg-white p-4"><Icon className="h-4 w-4 text-sky"/><p className="mt-2 text-xs font-semibold text-cream-faint">{f.label}</p><p className="mt-1 text-sm font-semibold text-cream">{f.value}</p></div>})}</div>
  <div className="p-5"><div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-sky"/><h3 className="text-sm font-semibold uppercase tracking-wider text-cream">Coach next actions</h3></div><div className="grid gap-3 md:grid-cols-2">{actions.map(a=><Link key={a.key} href={a.href} className={`group rounded-2xl border p-4 transition hover:border-sky/60 ${tone[a.priority]}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-cream">{a.label}</p><p className="mt-1 text-xs leading-5 text-cream-dim">{a.reason}</p></div><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-sky transition group-hover:translate-x-0.5"/></div></Link>)}</div></div>
 </section>;
}
