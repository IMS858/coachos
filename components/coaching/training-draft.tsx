"use client";
import {useRef,useState} from "react";
import {FUEL_UUID} from "@/lib/fuel/model";
export type TrainingDraftInput={assessment_id:string;client_id:string;expected_assessment_updated_at:string;sessions_per_week:number;goal:string};
type RequestBody=TrainingDraftInput&{request_id:string;response_format:"json";pdf_mode:"client"};
export type TrainingDraftResult={id:string;state:"draft_saved"|"needs_pdf_review"};
export function useTrainingDraft(){
 const lock=useRef(false),pending=useRef<RequestBody|null>(null),ambiguous=useRef(false),finished=useRef(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<TrainingDraftResult|null>(null);
 async function send(body:RequestBody){
  if(lock.current||finished.current)return;lock.current=true;setBusy(true);setError(null);
  try{
   const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
   const data=await response.json().catch(()=>null);
   if(!response.ok){if(response.status>=500||ambiguous.current){ambiguous.current=true;setUncertain(true);setError("Training save is unconfirmed. Retry this exact request; do not start another generation.");}else{pending.current=null;setError(data?.detail??data?.error??"Training draft could not be created.");}return;}
   if(!data||data.request_id!==body.request_id||data.client_id!==body.client_id||data.program_id!==body.request_id||!FUEL_UUID.test(data.program_id)||!["draft_saved","needs_pdf_review"].includes(data.state)){
    ambiguous.current=true;setUncertain(true);setError("Incomplete training receipt. Retry the preserved request before editing.");return;
   }
   pending.current=null;finished.current=true;ambiguous.current=false;setUncertain(false);setResult({id:data.program_id,state:data.state});
  }catch{ambiguous.current=true;setUncertain(true);setError("Connection interrupted. Retry the preserved training request to recover the same draft.");}finally{lock.current=false;setBusy(false);}
 }
 async function generate(input:TrainingDraftInput){if(lock.current||pending.current||finished.current)return;const body:RequestBody={...input,request_id:crypto.randomUUID(),response_format:"json",pdf_mode:"client"};pending.current=body;await send(body);}
 return {generate,retry:()=>pending.current?send(pending.current):Promise.resolve(),busy,uncertain,error,result,locked:busy||uncertain||Boolean(result)};
}
