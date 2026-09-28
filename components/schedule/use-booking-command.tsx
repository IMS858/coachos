"use client";
import {useRef,useState} from "react";
import {parseBookingEnvelope,validBookingReceipt,type BookingCommand,type BookingEnvelope,type BookingReceipt} from "@/lib/schedule/commands";
/** An uncertain response locks the exact payload. Never rotate identity after an ambiguous write. */
export function useBookingCommand(){
 const inFlight=useRef(false),pending=useRef<BookingEnvelope|null>(null),ambiguous=useRef(false),finished=useRef(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<BookingReceipt|null>(null);
 async function send(envelope:BookingEnvelope){
  if(inFlight.current||finished.current)return;inFlight.current=true;setBusy(true);setError(null);
  try{const res=await fetch('/api/schedule/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),signal:AbortSignal.timeout(55000)}),data=await res.json().catch(()=>null);
   if(!res.ok){if(res.status>=500||ambiguous.current){ambiguous.current=true;setUncertain(true);setError('Save unconfirmed. Retry this exact booking request before editing or starting another.');}else{pending.current=null;setError(data?.error??'Booking was not saved.');}return;}
   if(!validBookingReceipt(data,envelope)){ambiguous.current=true;setUncertain(true);setError('Incomplete receipt. Retry the same request to confirm what was saved.');return;}
   finished.current=true;pending.current=null;ambiguous.current=false;setUncertain(false);setResult(data);
  }catch{ambiguous.current=true;setUncertain(true);setError('Connection interrupted. Your exact booking request is preserved; retry it safely.');}finally{inFlight.current=false;setBusy(false);}
 }
 async function submit(command:BookingCommand,reason:string){if(inFlight.current||pending.current||finished.current)return;try{const envelope=parseBookingEnvelope({request_id:crypto.randomUUID(),command:{...command,confirmed:true,reason}});pending.current=envelope;await send(envelope);}catch(cause){setError(cause instanceof Error?cause.message:'Review the booking details.');}}
 return {submit,retry:()=>pending.current?send(pending.current):Promise.resolve(),busy,uncertain,error,result,locked:busy||uncertain||Boolean(result)};
}
