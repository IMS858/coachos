"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function ContactClientConversion({contactId,defaultEmail,trainers}:{contactId:string;defaultEmail:string;trainers:{id:string;name:string}[]}){
 const router=useRouter(),[open,setOpen]=useState(false),[email,setEmail]=useState(defaultEmail),[trainerId,setTrainerId]=useState(trainers[0]?.id??""),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{
  const response=await fetch("/api/leads/"+contactId+"/convert",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,trainer_id:trainerId,send_invite:false})});
  const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.error||"Could not add this contact as a client.");
  router.push("/clients/"+result.client_id);router.refresh();
 }catch(cause){setError(cause instanceof Error?cause.message:"Connection lost. Try again.");}finally{setBusy(false);}}
 if(!open)return <button type="button" onClick={()=>setOpen(true)} className="min-h-11 rounded-xl bg-sky px-5 text-sm font-semibold text-white">Add as client</button>;
 return <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl border border-sky/30 bg-sky/5 p-4">
  <div><h2 className="font-semibold text-cream">Confirm client conversion</h2><p className="mt-1 text-xs leading-5 text-cream-dim">Creates the Coach OS client profile. It does not send a login invite, create a package, infer a balance, book a session or send a message.</p></div>
  {error&&<p role="alert" className="rounded-xl border border-status-limited/40 bg-white p-3 text-sm text-status-limited">{error}</p>}
  <label className="block text-xs font-medium text-cream-dim">Client email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 text-base text-cream"/></label>
  <label className="block text-xs font-medium text-cream-dim">Primary coach<select required value={trainerId} onChange={e=>setTrainerId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 text-base text-cream"><option value="">Choose coach</option>{trainers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  <div className="flex flex-wrap gap-2"><button disabled={busy||!trainerId} className="min-h-11 rounded-xl bg-sky px-5 text-sm font-semibold text-white disabled:opacity-50">{busy?"Creating client…":"Confirm add as client"}</button><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="min-h-11 rounded-xl border border-divider bg-white px-5 text-sm font-semibold text-cream">Cancel</button></div>
 </form>;
}
