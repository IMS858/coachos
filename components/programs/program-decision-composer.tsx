"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Plus} from "lucide-react";

const options=[
 ["progression","Progression"],["regression","Regression"],["technique","Technique / cue"],["assessment","Assessment evidence"],["tolerance","Tolerance / response"],["schedule","Schedule / adherence"],["other","Other coaching decision"],
] as const;

export function ProgramDecisionComposer({programId}:{programId:string}){
 const router=useRouter(),requestId=useRef<string|null>(null);
 const [category,setCategory]=useState("progression"),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function save(){
  if(busy||note.trim().length<10)return;setBusy(true);setError(null);requestId.current??=crypto.randomUUID();
  try{const response=await fetch(`/api/programs/${programId}/decision-notes`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:requestId.current,category,note:note.trim()})});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||"Decision note was not confirmed saved.");setNote("");requestId.current=null;router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Could not save decision note.");}finally{setBusy(false);}
 }
 return <div className="rounded-2xl border border-sky/20 bg-sky/5 p-4"><p className="text-sm font-semibold text-cream">Record why the program changed</p><p className="mt-1 text-xs leading-5 text-cream-dim">Optional, staff-only, and immutable. Capture the coaching reason without changing publication state.</p><div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]"><select value={category} disabled={busy} onChange={e=>{setCategory(e.target.value);requestId.current=null;}} className="min-h-11 rounded-xl border border-divider bg-white px-3 text-sm text-cream">{options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><textarea value={note} disabled={busy} onChange={e=>{setNote(e.target.value);requestId.current=null;}} maxLength={2000} rows={2} placeholder="e.g. Progressed split squat from bodyweight to 20 lb after two clean sessions at target RPE." className="min-h-20 rounded-xl border border-divider bg-white px-3 py-2 text-sm text-cream"/></div>{error&&<p role="alert" className="mt-2 text-xs text-status-limited">{error}</p>}<button type="button" disabled={busy||note.trim().length<10} onClick={()=>void save()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{busy?"Saving…":"Add decision note"}</button></div>;
}
