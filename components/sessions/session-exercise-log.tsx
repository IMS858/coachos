"use client";
import {useMemo,useRef,useState} from "react";
import {Check,Loader2} from "lucide-react";
import type {SessionPlanRow} from "@/lib/coaching/session-execution";

type Existing={
 id:string;prescription_key:string;updated_at:string;sets_completed:number|null;reps_completed:string;load_performed:string;rpe_actual:number|null;coach_note:string;
};
type Actual={id:string;updated_at:string|null;sets_completed:number|null;reps_completed:string;load_performed:string;rpe_actual:number|null;coach_note:string};
const blank=():Actual=>({id:crypto.randomUUID(),updated_at:null,sets_completed:null,reps_completed:"",load_performed:"",rpe_actual:null,coach_note:""});
const field="mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";

export function SessionExerciseLog({sessionId,rows,existing}:{sessionId:string;rows:SessionPlanRow[];existing:Existing[]}){
 const initial=useMemo(()=>Object.fromEntries(rows.map(row=>{const found=existing.find(x=>x.prescription_key===row.key);return [row.key,found?{id:found.id,updated_at:found.updated_at,sets_completed:found.sets_completed,reps_completed:found.reps_completed??"",load_performed:found.load_performed??"",rpe_actual:found.rpe_actual,coach_note:found.coach_note??""}:blank()]})),[rows,existing]);
 const [values,setValues]=useState<Record<string,Actual>>(initial),[saving,setSaving]=useState<string|null>(null),[messages,setMessages]=useState<Record<string,string>>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const locks=useRef(new Set<string>());
 function update(key:string,patch:Partial<Actual>){setValues(old=>({...old,[key]:{...old[key],...patch}}));setMessages(old=>({...old,[key]:""}));}
 async function save(row:SessionPlanRow){
  if(locks.current.has(row.key))return;locks.current.add(row.key);setSaving(row.key);setErrors(old=>({...old,[row.key]:""}));setMessages(old=>({...old,[row.key]:""}));
  const value=values[row.key];
  try{
   const response=await fetch(`/api/sessions/${sessionId}/performance`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:value.id,prescription_key:row.key,expected_updated_at:value.updated_at,sets_completed:value.sets_completed,reps_completed:value.reps_completed,load_performed:value.load_performed,rpe_actual:value.rpe_actual,coach_note:value.coach_note})});
   const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok||!data.updated_at)throw new Error(data?.error||"Save was not confirmed.");
   setValues(old=>({...old,[row.key]:{...old[row.key],updated_at:data.updated_at}}));setMessages(old=>({...old,[row.key]:"Saved to this session."}));
  }catch(cause){setErrors(old=>({...old,[row.key]:cause instanceof Error?cause.message:"Could not save exercise result."}));}
  finally{locks.current.delete(row.key);setSaving(null);}
 }
 return <div className="space-y-3">{rows.map((row,index)=>{const value=values[row.key],p=row.prescription;return <article key={row.key} className="rounded-2xl border border-divider bg-white p-4 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-sky">{row.block.replaceAll("_"," ")} · {index+1}</p><h3 className="mt-1 text-base font-semibold text-cream">{row.name}</h3></div><div className="max-w-sm text-right text-xs leading-5 text-cream-dim"><span className="font-semibold text-cream">Planned:</span> {[p.sets!=null?`${p.sets} sets`:"",p.reps,p.load,p.rpe!=null?`RPE ${p.rpe}`:"",p.rest_seconds!=null?`${p.rest_seconds}s rest`:"",p.tempo?p.tempo+" tempo":""].filter(Boolean).join(" · ")||"No dosage entered"}{p.cue&&<span className="block text-cream-faint">{p.cue}</span>}</div></div>
   <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-xs font-semibold text-cream-dim">Sets done<input className={field} type="number" inputMode="numeric" min={0} max={30} value={value.sets_completed??""} onChange={e=>update(row.key,{sets_completed:e.target.value===""?null:Number(e.target.value)})}/></label><label className="text-xs font-semibold text-cream-dim">Reps / time done<input className={field} maxLength={80} value={value.reps_completed} onChange={e=>update(row.key,{reps_completed:e.target.value})} placeholder={p.reps||"e.g. 8,8,7"}/></label><label className="text-xs font-semibold text-cream-dim">Load performed<input className={field} maxLength={160} value={value.load_performed} onChange={e=>update(row.key,{load_performed:e.target.value})} placeholder={p.load||"e.g. 25 lb"}/></label><label className="text-xs font-semibold text-cream-dim">Actual RPE<input className={field} type="number" inputMode="decimal" min={1} max={10} step={0.5} value={value.rpe_actual??""} onChange={e=>update(row.key,{rpe_actual:e.target.value===""?null:Number(e.target.value)})}/></label></div>
   <label className="mt-3 block text-xs font-semibold text-cream-dim">Coach observation<textarea className={field} rows={2} maxLength={1000} value={value.coach_note} onChange={e=>update(row.key,{coach_note:e.target.value})} placeholder="Technique, tolerance, progression or what to change next time."/></label>
   {errors[row.key]&&<p role="alert" className="mt-2 text-xs text-status-limited">{errors[row.key]}</p>}{messages[row.key]&&<p role="status" className="mt-2 flex items-center gap-1 text-xs text-status-optimal"><Check className="h-3.5 w-3.5"/>{messages[row.key]}</p>}
   <button type="button" disabled={saving===row.key} onClick={()=>void save(row)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{saving===row.key?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{value.updated_at?"Update performed result":"Save performed result"}</button>
  </article>})}</div>;
}
