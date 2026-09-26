"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {closeSessionLoop,requireConfirmedAction,type SessionNotes} from "@/lib/coaching/session-close";
import {useSessionWorkspace} from "./session-workspace";
interface SessionData{id:string;scheduled_at:string;duration_minutes:number;session_type:string;service_type:string|null;status:string;notes_pre:string|null;notes_post:string|null;completed_at:string|null;plan_id:string|null;client_id:string;trainer_id:string|null;client:{full_name:string;email:string;phone:string|null};trainer:{full_name:string}|null}
interface ActivePlan{id:string;kind:"subscription"|"package";tier:string;service_type:string|null;custom_label:string|null;current_session_number:number|null;total_sessions:number|null;sessions_used:number|null;status:string}
export function SessionDetail({session,activePlans}:{session:SessionData;activePlans:ActivePlan[]}){
 const router=useRouter(),lock=useRef(false),{hasUnsavedResults,setUnsavedNotes,saveEditedResults,beginClose,endClose,asOf}=useSessionWorkspace();
 const [pre,setPre]=useState(session.notes_pre??""),[post,setPost]=useState(session.notes_post??"");
 const [saved,setSaved]=useState<SessionNotes>({notes_pre:session.notes_pre,notes_post:session.notes_post});
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const dirty=pre!==(saved.notes_pre??"")||post!==(saved.notes_post??"");
 useEffect(()=>{setUnsavedNotes(dirty||busy);return ()=>setUnsavedNotes(false);},[dirty,busy,setUnsavedNotes]);
 const eligible=["scheduled","confirmed"].includes(session.status)&&Date.parse(session.scheduled_at)<=Date.parse(asOf);
 const training=session.session_type==="training"&&(session.service_type===null||session.service_type==="training"),assessment=session.session_type==="assessment";
 async function persistNotes():Promise<boolean>{
  if(!dirty)return false;
  const notes={notes_pre:pre===(saved.notes_pre??"")?saved.notes_pre:pre,notes_post:post===(saved.notes_post??"")?saved.notes_post:post};
  const response=await fetch(`/api/sessions/${session.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...notes,expected_notes:saved})});const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true)throw new Error(result?.error||"Notes were not confirmed saved. Session completion was not attempted.");
  setSaved(notes);return true;
 }
 async function completeAction(undo=false){
  const response=await fetch(`/api/sessions/${session.id}/complete`,{method:undo?"DELETE":"POST",headers:{"Content-Type":"application/json"},...(!undo?{body:JSON.stringify({service_type:assessment?null:"training"})}:{})});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(result?.error||"Completion was not confirmed. Check the session before retrying.");
  return requireConfirmedAction(result);
 }
 async function run(action:"notes"|"complete"|"undo"){
  if(lock.current||!beginClose())return;lock.current=true;setBusy(true);setError(null);setMessage(null);
  try{
   if(action==="undo"&&hasUnsavedResults)throw new Error("Save or discard edited exercise results before undoing completion.");
   if(action==="complete"&&!window.confirm("Save edited exercise results and notes, then mark this session complete? This updates session/package usage. Unrecorded exercises stay unrecorded."))return;
   if(action==="undo"&&!window.confirm("Undo this completion? The existing session/package transaction will be reversed."))return;
   if(action==="notes"){await persistNotes();setMessage("Session notes saved. No completion or billing change was made.");return;}
   if(action==="undo"){await persistNotes();await completeAction(true);setMessage("Completion reversed.");router.refresh();return;}
   const receipt=await closeSessionLoop({saveResults:saveEditedResults,persistNotes,complete:()=>completeAction()});
   if(!receipt.ok){setError(receipt.error??"Session close was not confirmed.");if(receipt.stage==="completion")setMessage("Edited results and notes have been saved. Completion is not confirmed; check the session before retrying.");return;}
   setMessage("Session completion confirmed. All edited results and notes are saved; unrecorded exercises remain unrecorded.");router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Session action was not confirmed.");}
  finally{lock.current=false;setBusy(false);endClose();}
 }
 return <section id="session-close" className="scroll-mt-24 space-y-4"><div><p className="text-xs uppercase tracking-widest text-sky">Review & close</p><h2 className="mt-1 text-2xl font-semibold">Session notes and completion</h2><p className="mt-1 text-sm text-cream-dim">One finish action saves edited results, saves your notes, then completes the session. A failed save stops the workflow.</p></div>
 <div className="rounded-2xl border border-divider bg-white p-4"><fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Session notes</legend><label className="block text-sm font-semibold" htmlFor="session-pre-note">Pre-session note<textarea id="session-pre-note" disabled={session.status==="completed"} rows={3} maxLength={4000} value={pre} onChange={e=>setPre(e.target.value)} className="mt-2 w-full rounded-xl border border-divider p-3 text-base disabled:opacity-60"/></label><label className="block text-sm font-semibold" htmlFor="session-post-note">Post-session debrief<textarea id="session-post-note" rows={4} maxLength={4000} value={post} onChange={e=>setPost(e.target.value)} placeholder="What changed, how did they respond, and what should you review next time?" className="mt-2 w-full rounded-xl border border-divider p-3 text-base"/></label><p className="text-xs leading-5 text-cream-faint">Your last completed-session debrief appears in the next pre-session brief. It is not copied into a new prescription or sent as a message.</p><button type="button" disabled={busy||!dirty} onClick={()=>void run("notes")} className="min-h-12 rounded-xl border border-sky/30 px-4 text-sm font-semibold text-sky disabled:opacity-50">{busy?"Working…":"Save session notes"}</button></fieldset></div>
 {error&&<p role="alert" className="rounded-xl border border-status-limited/30 p-4 text-sm text-status-limited">{error}</p>}{message&&<p role="status" className="rounded-xl bg-sky/5 p-4 text-sm text-sky">{message}</p>}
 {hasUnsavedResults&&<p className="rounded-xl bg-sky/5 p-4 text-sm">Edited exercise results will be saved first. Only changed rows are recorded; blank exercises are not marked performed.</p>}
 <div className="flex flex-wrap gap-3">{eligible&&(training||assessment)&&<button type="button" disabled={busy} onClick={()=>void run("complete")} className="min-h-12 rounded-xl bg-sky px-5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Saving & checking…":"Save & finish session"}</button>}{session.status==="completed"&&<button type="button" disabled={busy||hasUnsavedResults} onClick={()=>void run("undo")} className="min-h-12 rounded-xl border border-divider bg-white px-4 text-sm font-semibold disabled:opacity-50">Undo completion</button>}<Link href={`/clients/${session.client_id}`} className="inline-flex min-h-12 items-center text-sm font-semibold text-sky">Client history →</Link></div>
 {!eligible&&session.status!=="completed"&&<p className="text-sm text-cream-dim">Only an occurred, scheduled or confirmed training session can be completed here. Current status: {session.status.replaceAll("_"," ")}. Refresh once the session has started.</p>}
 <details className="rounded-2xl border border-divider bg-white p-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Active plan evidence · {activePlans.length}</summary><p className="text-xs leading-5 text-cream-faint">The completion transaction determines package usage. These cards do not choose or debit a plan.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{activePlans.map(plan=>{const known=Number.isInteger(plan.total_sessions)&&Number.isInteger(plan.sessions_used);return <div key={plan.id} className="rounded-xl bg-surface-soft p-3"><p className="text-sm font-semibold">{plan.custom_label||plan.tier.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-cream-dim">{plan.kind==="package"?known?`${plan.sessions_used} used / ${plan.total_sessions} purchased` : "Package counters need review": "Active subscription"}{plan.id===session.plan_id?" · linked to this session":""}</p></div>;})}</div></details>
 </section>;
}
