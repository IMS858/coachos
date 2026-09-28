"use client";
import {useRef,useState} from 'react';
import {UUID} from '@/lib/schedule/booking-context';
export type SessionCreateInput={mode:'schedule'|'log';client_id:string;trainer_id:string;scheduled_at:string;duration_minutes:number;session_type:'training'|'assessment';service_type:'training'|null;notes_pre:string|null;notes_post:string|null};
export function useSessionCreate(){
 const lock=useRef(false),pending=useRef<(SessionCreateInput&{request_id:string})|null>(null),ambiguous=useRef(false),finished=useRef(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[id,setId]=useState<string|null>(null);
 async function send(payload:SessionCreateInput&{request_id:string}){
  if(lock.current||finished.current)return;lock.current=true;setBusy(true);setError(null);
  try{const response=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)}),data=await response.json().catch(()=>null);
   if(!response.ok){if(response.status>=500||ambiguous.current){ambiguous.current=true;setUncertain(true);setError('Session save unconfirmed. Retry this same request; do not create another session.');}else{pending.current=null;setError(data?.error??'Session not saved.');}return;}
   if(data?.ok!==true||data.session_id!==payload.request_id||!UUID.test(data.session_id)){ambiguous.current=true;setUncertain(true);setError('Session receipt was incomplete. Retry the preserved request.');return;}
   finished.current=true;pending.current=null;ambiguous.current=false;setUncertain(false);setId(data.session_id);
  }catch{ambiguous.current=true;setUncertain(true);setError('Connection interrupted. Retry the same session safely without changing its fields.');}finally{lock.current=false;setBusy(false);}
 }
 async function submit(input:SessionCreateInput){if(lock.current||pending.current||finished.current)return;
  // The full payload is the fingerprint: edits may use a fresh ID only after a definitive rejection.
  const payload={...input,request_id:crypto.randomUUID()};pending.current=payload;await send(payload);
 }
 return{submit,retry:()=>pending.current?send(pending.current):Promise.resolve(),busy,uncertain,error,id,locked:busy||uncertain||Boolean(id)};
}
