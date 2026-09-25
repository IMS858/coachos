"use client";
import {useEffect,useRef,useState} from "react";
import {Check,Save} from "lucide-react";
import {EMPTY_PERFORMED,parsePerformedValues,performedSignature,performedSummary,type PerformedValues,type PerformanceRecord,type SessionPlanRow} from "@/lib/coaching/session-execution";
import {prescriptionSummary} from "@/lib/exercises/prescription";
import {useSessionWorkspace} from "./session-workspace";
const input="mt-1 min-h-12 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:ring-2 focus-visible:ring-sky";
type State={id:string|null;version:string|null;value:PerformedValues;saved:string;error:string|null;message:string|null};
export function SessionExerciseLog({sessionId,programVersion,rows,existing,previous=[],readOnly=false}:{sessionId:string;programVersion:string;rows:SessionPlanRow[];existing:PerformanceRecord[];previous?:PerformanceRecord[];readOnly?:boolean}){
 const {setUnsavedResults}=useSessionWorkspace();
 const [state,setState]=useState<Record<string,State>>(()=>Object.fromEntries(rows.map(row=>{const old=existing.find(r=>r.prescription_key===row.key);const value:PerformedValues=old?{sets_completed:old.sets_completed,reps_completed:old.reps_completed,load_performed:old.load_performed,rpe_actual:old.rpe_actual===null?null:Number(old.rpe_actual),coach_note:old.coach_note}:{...EMPTY_PERFORMED};return [row.key,{id:old?.id??null,version:old?.updated_at??null,value,saved:performedSignature(value),error:null,message:null}];})));
 const pendingIds=useRef(new Map<string,string>()),lock=useRef(false);
 const [busy,setBusy]=useState(false),[filter,setFilter]=useState<"all"|"edited">("all");
 const dirty=rows.filter(row=>performedSignature(state[row.key].value)!==state[row.key].saved);
 useEffect(()=>{setUnsavedResults(dirty.length>0||busy);return ()=>setUnsavedResults(false);},[dirty.length,busy,setUnsavedResults]);
 function edit(key:string,patch:Partial<PerformedValues>){setState(old=>({...old,[key]:{...old[key],value:{...old[key].value,...patch},message:null,error:null}}));}
 async function saveRows(selected:SessionPlanRow[]){
  if(lock.current||readOnly)return;lock.current=true;setBusy(true);
  try{for(const row of selected){const current=state[row.key];try{
   const actual=parsePerformedValues(current.value);
   const requestId=current.id??pendingIds.current.get(row.key)??crypto.randomUUID();pendingIds.current.set(row.key,requestId);
   const response=await fetch(`/api/sessions/${sessionId}/performance`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:requestId,prescription_key:row.key,expected_updated_at:current.version,expected_program_updated_at:programVersion,expected_prescription:row.prescription,actual})});
   const result=await response.json().catch(()=>null);if(!response.ok||!result?.ok||!result.id||!result.updated_at)throw new Error(result?.error||"Save was not confirmed. Your edits remain here.");
   setState(old=>({...old,[row.key]:{id:result.id,version:result.updated_at,value:actual,saved:performedSignature(actual),message:"Saved to this session with history.",error:null}}));
  }catch(cause){setState(old=>({...old,[row.key]:{...old[row.key],message:null,error:cause instanceof Error?cause.message:"Save was not confirmed."}}));}}
  }finally{lock.current=false;setBusy(false);}
 }
 const visible=filter==="edited"?dirty:rows;
 return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-cream-dim">{rows.length} prescribed exercises · {dirty.length} edited · {Object.values(state).filter(s=>s.version!==null).length} recorded</p><label className="text-xs font-semibold">Show<select className="ml-2 min-h-11 rounded-lg border border-divider px-2" value={filter} onChange={e=>setFilter(e.target.value as "all"|"edited")}><option value="all">All exercises</option><option value="edited">Unsaved edits</option></select></label></div>
 {readOnly&&<p className="rounded-xl border border-divider bg-surface-soft p-3 text-sm">This session is read-only for performed results. Future, requested or missed sessions cannot be recorded as performed.</p>}
 {visible.map((row,index)=>{const current=state[row.key],changed=performedSignature(current.value)!==current.saved;const last=row.exercise_id?previous.find(r=>r.exercise_id===row.exercise_id&&r.session_id!==sessionId):undefined;
 return <details key={row.key} open={index===0||changed||!!current.error} className="rounded-2xl border border-divider bg-white p-4 shadow-sm"><summary className="min-h-12 cursor-pointer text-sm font-semibold"><span className="text-xs uppercase text-sky">{row.block} · </span>{row.name}<span className="ml-2 text-xs font-normal text-cream-faint">{changed?"Unsaved":current.version?"Recorded":"Not recorded"}</span></summary>
 <div className="mt-2 rounded-xl bg-sky/5 p-3 text-sm"><p className="text-xs font-semibold uppercase text-sky">{current.version?"Original prescription snapshot":"Planned prescription"}</p><p className="mt-1">{prescriptionSummary(row.prescription)||"No dosage specified"}</p>{row.prescription.cue&&<p className="mt-1 text-xs text-cream-dim">Cue: {row.prescription.cue}</p>}</div>
 {last&&<p className="mt-2 rounded-xl bg-surface-soft p-3 text-xs leading-5 text-cream-dim">Previous completed session · {new Date(last.performed_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"})}<br/>{performedSummary(last)}</p>}
 <fieldset disabled={busy||readOnly} className="mt-3 grid grid-cols-2 gap-3"><legend className="sr-only">Actually performed for {row.name}</legend>
 <label className="text-xs font-semibold">Sets done<input className={input} type="number" inputMode="numeric" min={0} max={30} value={current.value.sets_completed??""} onChange={e=>edit(row.key,{sets_completed:e.target.value===""?null:Number(e.target.value)})}/></label>
 <label className="text-xs font-semibold">Reps / time done<input className={input} maxLength={80} value={current.value.reps_completed} onChange={e=>edit(row.key,{reps_completed:e.target.value})} placeholder="e.g. 8, 8, 7 or 30s"/></label>
 <label className="text-xs font-semibold">Load performed<input className={input} maxLength={160} value={current.value.load_performed} onChange={e=>edit(row.key,{load_performed:e.target.value})} placeholder="Include units, e.g. 25 lb"/></label>
 <label className="text-xs font-semibold">Actual RPE<input className={input} type="number" inputMode="decimal" min={1} max={10} step={0.5} value={current.value.rpe_actual??""} onChange={e=>edit(row.key,{rpe_actual:e.target.value===""?null:Number(e.target.value)})}/></label>
 <label className="col-span-2 text-xs font-semibold">Private coach observation<textarea className={input} maxLength={1000} rows={2} value={current.value.coach_note} onChange={e=>edit(row.key,{coach_note:e.target.value})} placeholder="Technique, tolerance and what to revisit. Staff-only."/></label></fieldset>
 {current.error&&<p role="alert" className="mt-2 text-sm text-status-limited">{current.error}</p>}{current.message&&<p role="status" className="mt-2 text-xs text-sky">{current.message}</p>}
 <button type="button" disabled={busy||readOnly||!changed} onClick={()=>void saveRows([row])} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4"/>Save actual result</button>
 </details>;})}
 {!readOnly&&<div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky/30 bg-white p-3 shadow-lg lg:bottom-4"><p className="text-xs text-cream-dim">{busy?"Saving edited rows…":dirty.length?`${dirty.length} exercise result${dirty.length===1?"":"s"} not saved`:"No unsaved exercise edits"}</p><button type="button" disabled={busy||!dirty.length} onClick={()=>void saveRows(dirty)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{busy?"Saving…":"Save edited results"}</button></div>}
 <p className="text-xs leading-5 text-cream-faint">Actual fields start empty. Saving a result does not complete the session, consume a package session or change the original program.</p></div>;
}
