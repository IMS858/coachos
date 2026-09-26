import Link from "next/link";
import {ClipboardCheck,Scale,TrendingUp,CalendarCheck,FileText,ArrowRight} from "lucide-react";
import {createClient} from "@/lib/supabase/server";

export async function ClientEvidenceSummary({clientId}:{clientId:string}){
 const db=await createClient();
 const [assessQ,bodyQ,signalsQ,sessionsQ,programsQ]=await Promise.all([
  db.from("assessments").select("id,assessment_date,status").eq("client_id",clientId).eq("status","complete").order("assessment_date",{ascending:false}),
  db.from("body_comp_records").select("id,recorded_at").eq("client_id",clientId).order("recorded_at",{ascending:false}),
  db.from("v_progression_signals").select("pattern,last_recorded,sessions_considered").eq("client_id",clientId).order("last_recorded",{ascending:false}),
  db.from("sessions").select("id,completed_at,scheduled_at").eq("client_id",clientId).eq("status","completed").order("scheduled_at",{ascending:false}).limit(200),
  db.from("programs").select("id,name,status,published_at").eq("client_id",clientId).in("status",["published","active"]).order("published_at",{ascending:false}),
 ]);
 if([assessQ,bodyQ,signalsQ,sessionsQ,programsQ].some(q=>q.error))return <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Coaching evidence</h2><p className="mt-2 text-sm text-status-limited">Evidence summary could not be loaded. No client data was changed.</p></section>;
 const assessments=assessQ.data??[],body=bodyQ.data??[],signals=signalsQ.data??[],sessions=sessionsQ.data??[],programs=programsQ.data??[];
 const fmt=(v:string|null|undefined)=>v?new Date(v+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
 const cards=[
  {label:"Assessments",value:String(assessments.length),detail:assessments[0]?("Latest "+fmt(assessments[0].assessment_date)):"No completed assessment",icon:ClipboardCheck},
  {label:"Body composition",value:String(body.length),detail:body[0]?("Latest "+fmt(body[0].recorded_at)):"No body-comp records",icon:Scale},
  {label:"Progression signals",value:String(signals.length),detail:signals[0]?((signals[0].pattern??"Signal")+" · "+new Date(signals[0].last_recorded).toLocaleDateString("en-US",{month:"short",day:"numeric"})):"No progression signals",icon:TrendingUp},
  {label:"Completed sessions",value:String(sessions.length),detail:sessions[0]?("Latest "+new Date(sessions[0].scheduled_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric"})):"No completed sessions",icon:CalendarCheck},
  {label:"Current programs",value:String(programs.length),detail:programs[0]?.name??"No published/active program",icon:FileText},
 ];
 return <section className="rounded-3xl border border-sky/15 bg-gradient-to-br from-white via-white to-sky/5 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky">Evidence trail</p><h2 className="mt-1 text-lg font-semibold text-cream">Coaching evidence</h2><p className="mt-1 text-sm leading-6 text-cream-dim">What IMS has actually measured and delivered for this client. Counts do not imply improvement by themselves.</p></div><Link href={"/reports/progress?client="+clientId} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-sky">Progress report <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(c=>{const Icon=c.icon;return <div key={c.label} className="rounded-2xl border border-divider bg-white p-4"><Icon className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold text-cream">{c.value}</p><p className="mt-1 text-xs font-semibold text-cream">{c.label}</p><p className="mt-1 text-xs leading-5 text-cream-faint">{c.detail}</p></div>})}</div>{assessments.length===1&&<p className="mt-4 text-xs leading-5 text-cream-dim">One completed assessment is on file. A future reassessment creates a true before/after evidence pair.</p>}{assessments.length>=2&&<p className="mt-4 text-xs leading-5 text-cream-dim">{assessments.length} completed assessments are available for longitudinal comparison.</p>}</section>;
}
