import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {ProgressReportView} from "@/components/progress/progress-report-view";
import {buildProgressReport} from "@/lib/queries/progress";
import {repeatedPerformance,type PerformanceEvidence} from "@/lib/coaching/performance-evidence";
export const dynamic="force-dynamic";
export default async function ProgressPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/progress");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)throw new Error("Account lookup unavailable.");if(!me.data||me.data.deleted_at||me.data.role!=="client")redirect("/dashboard");
 const now=new Date(),from=new Date(now.getTime()-28*86400000).toISOString();
 const [assessQ,bodyQ,countQ,recentQ,coachedQ,classQ]=await Promise.all([
  db.from("assessments").select("id,assessment_date,data").eq("client_id",user.id).eq("status","complete").order("assessment_date").limit(500),
  db.from("body_comp_records").select("recorded_at,weight_lb,body_fat_pct,lean_mass_lb").eq("client_id",user.id).order("recorded_at").limit(500),
  db.from("sessions").select("id",{count:"exact",head:true}).eq("client_id",user.id).eq("status","completed").lte("scheduled_at",now.toISOString()),
  db.from("sessions").select("id",{count:"exact",head:true}).eq("client_id",user.id).eq("status","completed").gte("scheduled_at",from).lte("scheduled_at",now.toISOString()),
  db.rpc("get_my_coached_performance"),
  db.from("class_enrollments").select("id").eq("client_id",user.id).eq("status","attended"),
 ]);
 const reportUnavailable=!!(assessQ.error||bodyQ.error||countQ.error||countQ.count===null);
 const report=reportUnavailable?null:buildProgressReport(assessQ.data??[],bodyQ.data??[],countQ.count!);
 const evidence:PerformanceEvidence[]=coachedQ.data??[],comparisons=repeatedPerformance(evidence,now);
 return <AppShell><main className="mx-auto w-full max-w-4xl space-y-5 pb-12"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Progress for life</p><h1 className="mt-2 text-4xl font-bold">My Progress</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/75">See the work you have recorded and the measurements your coach has completed. Your progress is not reduced to an invented score.</p></header>
 <div className="grid grid-cols-2 gap-3"><section className="rounded-2xl border border-divider bg-white p-4"><h2 className="text-xs font-semibold uppercase text-cream-faint">Coached consistency</h2>{recentQ.error||recentQ.count===null?<p role="alert" className="mt-3 text-sm text-status-limited">Session count unavailable</p>:<><p className="mt-3 text-3xl font-bold">{recentQ.count}</p><p className="mt-1 text-xs text-cream-dim">completed sessions in the last 28 days</p></>}</section>{classQ.error?<section className="rounded-2xl border border-divider bg-white p-4"><h2 className="text-xs font-semibold uppercase text-cream-faint">Group coaching</h2><p role="alert" className="mt-3 text-sm text-status-limited">Class attendance unavailable</p></section>:<section className="rounded-2xl border border-divider bg-white p-4"><h2 className="text-xs font-semibold uppercase text-cream-faint">Group coaching</h2><p className="mt-3 text-3xl font-bold">{classQ.data?.length??0}</p><p className="mt-1 text-xs text-cream-dim">classes attended · recorded attendance only</p></section>}<Link href="/workouts" className="flex min-h-28 flex-col justify-center rounded-2xl bg-sky p-4 text-white"><span className="text-lg font-semibold">My training history →</span><span className="mt-2 text-xs text-white/80">Coached results and your logged sets</span></Link></div>
 <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Your repeated training work</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Latest versus previous completed-session evidence for the same exercise. Different loads, repetitions or effort are context to discuss with your coach, not an automatic strength or safety rating.</p>
 {coachedQ.error?<p role="alert" className="mt-4 text-sm text-status-limited">Performance history is unavailable. Your measurements below remain separate.</p>:comparisons.groups.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{comparisons.groups.slice(0,6).map(item=><article key={item.exerciseId} className="rounded-xl bg-surface-soft p-4"><h3 className="font-semibold">{item.latest.exercise_name}</h3><p className="mt-3 text-xs font-semibold text-sky">Latest</p><p className="mt-1 text-sm">{item.latestText}</p><p className="mt-3 text-xs text-cream-faint">Previous</p><p className="mt-1 text-sm text-cream-dim">{item.priorText}</p></article>)}</div>:<p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-cream-dim">Repeat an approved exercise across completed coached sessions to see a comparison here. Missing evidence is not a lack of progress.</p>}
 <p className="mt-3 text-xs text-cream-faint">Comparisons use up to 100 shareable exercise records and distinct session identities. Private coach notes never appear here.</p></section>
 <section><h2 className="mb-3 text-xl font-semibold">Recorded measurements</h2>{report?<><ProgressReportView report={report} forClient/><p className="mt-3 text-xs text-cream-faint">Completed assessments and body-composition records only; up to 500 of each. Assessments are optional for programming-only clients.</p></>:<p role="alert" className="rounded-2xl border border-status-limited/30 bg-white p-5 text-sm text-status-limited">Measurement evidence could not be loaded. No zero values or improvement claims were substituted.</p>}</section>
 <Link href="/messages" className="inline-flex min-h-12 items-center rounded-xl border border-sky/30 px-4 text-sm font-semibold text-sky">Discuss progress with my coach →</Link></main></AppShell>;
}
