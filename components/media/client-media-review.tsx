"use client";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {confirmedMediaAction} from "@/lib/media/feedback";
export function ClientMediaReview({id}:{id:string}){
 const router=useRouter(),lock=useRef(false);
 const [feedback,setFeedback]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 async function save(){
  if(lock.current||saved||feedback.trim().length<2)return;
  lock.current=true;setBusy(true);setError(null);
  try{
   const response=await fetch("/api/media/"+id+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({feedback:feedback.trim()})});
   const data=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(data?.error||"Review was not confirmed.");
   confirmedMediaAction(data,id,"review");setSaved(true);router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Review was not confirmed. Your draft remains here.");}
  finally{lock.current=false;setBusy(false);}
 }
 return <div className="mt-4 rounded-xl border border-sky/20 bg-sky/5 p-4">
  <label htmlFor={"feedback-"+id} className="text-sm font-semibold text-cream">Feedback the client will see</label>
  <p id={"feedback-help-"+id} className="mt-1 text-xs leading-5 text-cream-dim">Review the clip first. Finalizing saves this response to the client’s coaching record and clears the review queue. It does not change their prescription or send an email.</p>
  <textarea id={"feedback-"+id} aria-describedby={"feedback-help-"+id} disabled={busy||saved} value={feedback} onChange={e=>setFeedback(e.target.value)} maxLength={2000} rows={3} className="mt-3 w-full rounded-xl border border-divider bg-white p-3 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"/>
  {error&&<p role="alert" className="mt-2 text-sm text-status-limited">{error}</p>}
  {saved?<p role="status" className="mt-3 text-sm font-semibold text-sky">Feedback saved. The client can read it in My Plan.</p>:<button type="button" disabled={busy||feedback.trim().length<2} onClick={()=>void save()} className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?"Confirming save…":"Finalize client feedback"}</button>}
 </div>;
}
