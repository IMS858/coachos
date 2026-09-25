import Link from "next/link";
import {Dumbbell} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {sessionPlanRows} from "@/lib/coaching/session-execution";
import {SessionExerciseLog} from "@/components/sessions/session-exercise-log";

export async function SessionTrainingExecution({sessionId}:{sessionId:string}){
 const db=await createClient();
 const session=await db.from("sessions").select("id,client_id,program_id,status").eq("id",sessionId).maybeSingle();
 if(session.error)return <section className="rounded-2xl border border-status-limited/30 bg-white p-5"><p role="alert" className="text-sm text-status-limited">Training execution evidence could not be loaded.</p></section>;
 if(!session.data||!session.data.program_id)return <section className="rounded-2xl border border-divider bg-white p-5"><div className="flex items-start gap-3"><Dumbbell className="mt-0.5 h-5 w-5 text-sky"/><div><h2 className="font-semibold text-cream">Run the training plan</h2><p className="mt-1 text-sm leading-6 text-cream-dim">This session is not linked to a program, so Coach OS will not invent a workout. Open the client profile to select or build the correct program first.</p><Link href={session.data?.client_id?`/clients/${session.data.client_id}#exercise-sets`:"/clients"} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Open programming workspace →</Link></div></div></section>;
 const [programQ,assignmentsQ,performanceQ]=await Promise.all([
  db.from("programs").select("id,name,status,data,client_id").eq("id",session.data.program_id).maybeSingle(),
  db.from("program_exercises").select("id,exercise_id,block,position,sets,reps,load_prescription,rest_seconds,tempo,notes,exercises(name,ims_label)").eq("program_id",session.data.program_id).order("position"),
  db.from("session_exercise_performance").select("id,prescription_key,updated_at,sets_completed,reps_completed,load_performed,rpe_actual,coach_note").eq("session_id",sessionId),
 ]);
 if(programQ.error||assignmentsQ.error||performanceQ.error)return <section className="rounded-2xl border border-status-limited/30 bg-white p-5"><h2 className="font-semibold text-cream">Run the training plan</h2><p role="alert" className="mt-2 text-sm text-status-limited">Program or performed-exercise evidence is unavailable. No blank workout was substituted.</p></section>;
 if(!programQ.data||programQ.data.client_id!==session.data.client_id)return <section className="rounded-2xl border border-status-limited/30 bg-white p-5"><p role="alert" className="text-sm text-status-limited">The linked program does not match this client. Reconcile the session before logging performance.</p></section>;
 const rows=sessionPlanRows(programQ.data.data,assignmentsQ.data??[]);
 return <section className="rounded-3xl border border-sky/20 bg-gradient-to-br from-white via-white to-sky/5 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-sky">Session execution</p><h2 className="mt-1 text-xl font-semibold text-cream">Prescription → performed</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-cream-dim">Log what actually happened beside the planned dosage. This preserves exercise identity and session evidence without rewriting the program prescription.</p></div><Link href={`/programs/${programQ.data.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Open program →</Link></div>
  {rows.length?<div className="mt-4"><SessionExerciseLog sessionId={sessionId} rows={rows} existing={(performanceQ.data??[]) as never}/></div>:<p className="mt-4 rounded-xl bg-surface-soft p-4 text-sm text-cream-dim">The linked program has no structured exercise rows that Coach OS can execute yet. The program remains unchanged.</p>}
 </section>;
}
