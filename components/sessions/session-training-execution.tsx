import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {executionRows,sessionPlanRows,type PerformanceRecord} from "@/lib/coaching/session-execution";
import {SessionExerciseLog} from "./session-exercise-log";
import {SessionProgramSelector} from "./session-program-selector";
import {SessionResultGate} from "./session-workspace";
const fields="id,session_id,prescription_key,exercise_id,exercise_name,prescription_snapshot,updated_at,performed_at,sets_completed,reps_completed,load_performed,rpe_actual,coach_note";
const unavailable=<section className="rounded-2xl border border-status-limited/30 bg-white p-5"><SessionResultGate available={false}/><h2 className="font-semibold">Session execution unavailable</h2><p role="alert" className="mt-2 text-sm text-status-limited">Program or performed-exercise evidence could not be loaded. No blank workout or zero result was substituted.</p></section>;
export async function SessionTrainingExecution({sessionId,asOf}:{sessionId:string;asOf:string}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(viewer.error)return unavailable;if(!viewer.data||viewer.data.deleted_at||!["owner","trainer"].includes(viewer.data.role))return null;
 const session=await db.from("sessions").select("id,client_id,trainer_id,program_id,status,scheduled_at,session_type").eq("id",sessionId).maybeSingle();
 if(session.error||!session.data)return unavailable;
 const s=session.data;
 const client=await db.from("clients").select("id,primary_trainer_id").eq("id",s.client_id).maybeSingle();
 if(client.error)return unavailable;if(!client.data||(viewer.data.role!=="owner"&&s.trainer_id!==user.id&&client.data.primary_trainer_id!==user.id))return null;
 const [choicesQ,performanceQ,previousSessionsQ]=await Promise.all([
  db.from("programs").select("id,name,status,data,client_id,updated_at").eq("client_id",s.client_id).in("status",["draft","published","active"]).order("updated_at",{ascending:false}).limit(100),
  db.from("session_exercise_performance").select(fields).eq("session_id",s.id).order("prescription_key"),
  db.from("sessions").select("id").eq("client_id",s.client_id).eq("status","completed").lt("scheduled_at",s.scheduled_at).order("scheduled_at",{ascending:false}).limit(30),
 ]);
 if(choicesQ.error||performanceQ.error||previousSessionsQ.error)return unavailable;
 const options=(choicesQ.data??[]).filter(p=>p.data?.source!=="ims_exercise_set");
 const existing=performanceQ.data as PerformanceRecord[];
 const locked=existing.length>0||!["scheduled","confirmed"].includes(s.status);
 const selector=<SessionProgramSelector key={s.program_id??"none"} sessionId={s.id} currentProgramId={s.program_id} options={options.map(p=>({id:p.id,name:p.name,status:p.status}))} locked={locked}/>;
 if(!s.program_id)return <section id="session-training" className="scroll-mt-24 space-y-3"><SessionResultGate available={true}/><h2 className="text-xl font-semibold">Run this client’s training</h2>{selector}<p className="text-sm text-cream-dim">Choose the correct program above, or <Link className="font-semibold text-sky" href={`/library?client_id=${s.client_id}`}>start Quick Programming</Link>. Exercise sets stay private and need conversion to a program first.</p></section>;
 const [programQ,assignmentsQ]=await Promise.all([
  db.from("programs").select("id,name,status,data,client_id,updated_at").eq("id",s.program_id).maybeSingle(),
  db.from("program_exercises").select("id,exercise_id,block,position,sets,reps,load_prescription,rest_seconds,tempo,notes").eq("program_id",s.program_id),
 ]);
 if(programQ.error||assignmentsQ.error||!programQ.data||programQ.data.client_id!==s.client_id)return unavailable;
 const assignments=assignmentsQ.data??[],ids=[...new Set(assignments.map(a=>a.exercise_id))];
 const priorIds=(previousSessionsQ.data??[]).map(row=>row.id);
 const [exerciseQ,previousQ]=await Promise.all([
  ids.length?db.from("exercises").select("id,name,ims_label").in("id",ids):Promise.resolve({data:[],error:null}),
  priorIds.length?db.from("session_exercise_performance").select(fields).in("session_id",priorIds).order("performed_at",{ascending:false}).limit(300):Promise.resolve({data:[],error:null}),
 ]);
 if(exerciseQ.error||previousQ.error)return unavailable;
 const names=new Map((exerciseQ.data??[]).map(e=>[e.id,e]));
 let rows;try{rows=executionRows(sessionPlanRows(programQ.data.data,assignments.map(a=>({...a,exercises:names.get(a.exercise_id)??null}))),existing);}catch{return unavailable;}
 const readOnly=s.session_type!=="training"||!["scheduled","confirmed","completed"].includes(s.status)||Date.parse(s.scheduled_at)>Date.parse(asOf);
 return <section id="session-training" className="scroll-mt-24 space-y-4 rounded-3xl border border-sky/20 bg-sky/5 p-4 sm:p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky">Session execution</p><h2 className="mt-1 text-2xl font-bold">Prescription → performed</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Record what actually happened without rewriting the program prescription. Coach observations remain private.</p></div>{selector}
 {rows.length?<SessionExerciseLog key={`${s.id}:${s.program_id}`} sessionId={s.id} programVersion={programQ.data.updated_at} rows={rows} existing={existing} previous={previousQ.data as PerformanceRecord[]} readOnly={readOnly}/>:<><SessionResultGate available={true}/><p className="rounded-xl bg-white p-4 text-sm">This program has no supported structured exercise rows. Open the reviewed program; no workout was inferred.</p></>}
 <Link href={`/programs/${s.program_id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Open program and decision trail →</Link><p className="text-xs text-cream-faint">Previous-result context uses up to 30 earlier completed sessions and 300 exercise records. The program selector shows up to 100 current client programs.</p></section>;
}
