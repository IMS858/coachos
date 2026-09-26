"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {useSessionWorkspace} from "./session-workspace";
export function SessionProgramSelector({sessionId,currentProgramId,options,locked}:{sessionId:string;currentProgramId:string|null;options:{id:string;name:string;status:string}[];locked:boolean}){
 const router=useRouter(),lock=useRef(false),workspace=useSessionWorkspace();
 const [selected,setSelected]=useState(currentProgramId??""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function save(){
  if(lock.current||!selected)return;if(workspace.hasUnsavedResults){setError("Save the edited exercise results before changing programs.");return;}
  lock.current=true;setBusy(true);setError(null);
  try{const response=await fetch(`/api/sessions/${sessionId}/program`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({program_id:selected,expected_program_id:currentProgramId})});const result=await response.json().catch(()=>null);if(!response.ok||!result?.ok)throw new Error(result?.error||"Program link was not confirmed.");router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to link the program.");}finally{lock.current=false;setBusy(false);}
 }
 return <section className="rounded-2xl border border-divider bg-white p-4"><label htmlFor="session-program" className="text-sm font-semibold text-cream">Program for this session</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select id="session-program" value={selected} disabled={locked||busy} onChange={e=>setSelected(e.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-divider bg-white px-3 text-base"><option value="">Choose a client program</option>{options.map(option=><option key={option.id} value={option.id}>{option.name} · {option.status==="draft"?"private coach draft":option.status}</option>)}</select><button type="button" disabled={locked||busy||!selected||selected===currentProgramId} onClick={()=>void save()} className="min-h-12 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?"Linking…":"Use this program"}</button></div><p className="mt-2 text-xs leading-5 text-cream-dim">{locked?"Program linkage is locked for this session or because performed evidence already exists.":"This links an existing client program. It does not publish a draft, approve an exercise or change billing."}</p>{error&&<p role="alert" className="mt-2 text-sm text-status-limited">{error}</p>}</section>;
}
