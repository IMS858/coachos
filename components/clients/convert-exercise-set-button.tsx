"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
export function ConvertExerciseSetButton({ setId, setName }: { setId: string; setName: string }) {
  const router=useRouter(); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  async function convert(){
    setBusy(true);setError(null);
    try{
      const response=await fetch(`/api/library/sets/${setId}/convert`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request_id:crypto.randomUUID(),name:setName})});
      const data=await response.json().catch(()=>null); if(!response.ok) throw new Error(data?.error||"Could not create the program draft.");
      router.push(`/programs/${data.id}`);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not create the program draft.");}finally{setBusy(false);}
  }
  return <div><button type="button" disabled={busy} onClick={()=>void convert()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50">{busy?"Creating…":<>Build program <ArrowRight className="h-4 w-4"/></>}</button>{error&&<p role="alert" className="mt-2 max-w-xs text-xs text-status-limited">{error}</p>}</div>;
}
