"use client";
import {useRef,useState,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {parseFuelCommand,validFuelReceipt,type FuelCommand} from "@/lib/fuel/validation";
import type {Targets} from "@/lib/fuel/model";
export const fieldClass="mt-1 min-h-12 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-60";
export const primaryClass="inline-flex min-h-12 items-center justify-center rounded-xl bg-sky px-4 py-3 text-sm font-semibold text-white disabled:opacity-50";
export const secondaryClass="inline-flex min-h-12 items-center justify-center rounded-xl border border-divider bg-white px-4 py-3 text-sm font-semibold text-sky disabled:opacity-50";
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="block text-sm font-semibold text-cream">{label}{children}</label>;}
export function NumberField({label,value,onChange,max=10000}:{label:string;value:number|null;onChange:(n:number|null)=>void;max?:number}){return <Field label={label}><input className={fieldClass} type="number" inputMode="decimal" min={0} max={max} step="any" value={value??""} onChange={e=>onChange(e.target.value===""?null:Number(e.target.value))}/></Field>;}
export function TargetFields({value,onChange}:{value:Targets;onChange:(value:Targets)=>void}){return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([["kcal","Energy · kcal"],["protein_g","Protein · g"],["carbs_g","Carbs · g"],["fat_g","Fat · g"]] as const).map(([key,label])=><NumberField key={key} label={label} value={value[key]} onChange={n=>onChange({...value,[key]:n})}/>)}</div>;}
export function useFuelMutation(clientId:string){
 const router=useRouter(),lock=useRef(false),pending=useRef<FuelCommand|null>(null);
 const [state,setState]=useState<"idle"|"busy"|"uncertain"|"saved">("idle"),[message,setMessage]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 async function send(command:FuelCommand){
  if(lock.current)return;lock.current=true;setState("busy");setError(null);setMessage(null);
  try{const response=await fetch(`/api/fuel/${clientId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});const body=await response.json().catch(()=>null);
   if(!response.ok){if(response.status>=500){setState("uncertain");setError(body?.error??"Save is unconfirmed. Retry the same request.");}else{pending.current=null;setState("idle");setError(body?.error??"Save rejected. Refresh and review your inputs.");}return;}
   if(!validFuelReceipt(body,command,clientId)){setState("uncertain");setError("Incomplete save receipt. Retry the preserved request before editing.");return;}
   pending.current=null;setState("saved");setMessage("Saved and confirmed. No automatic nutrition adjustment, payment or message was sent.");router.refresh();
  }catch{setState("uncertain");setError("Connection interrupted. Your request is preserved; retry without changing it.");}finally{lock.current=false;}
 }
 async function submit(input:unknown){if(lock.current||pending.current)return;let command;try{command=parseFuelCommand(input);}catch(cause){setError(cause instanceof Error?cause.message:"Invalid fuel inputs.");return;}pending.current=command;await send(command);}
 return {submit,retry:()=>pending.current?send(pending.current):Promise.resolve(),disabled:state==="busy"||state==="uncertain",uncertain:state==="uncertain",busy:state==="busy",message,error};
}
export function MutationStatus({mutation}:{mutation:ReturnType<typeof useFuelMutation>}){return <>{mutation.error&&<p role="alert" className="rounded-xl border border-status-limited/30 bg-white p-3 text-sm text-status-limited">{mutation.error}</p>}{mutation.message&&<p role="status" className="rounded-xl bg-sky/5 p-3 text-sm text-sky">{mutation.message}</p>}{mutation.uncertain&&<button type="button" className={secondaryClass} onClick={()=>void mutation.retry()}>Retry preserved request</button>}</>;}
export function PrintFuelButton(){return <button type="button" className={secondaryClass+" print:hidden"} onClick={()=>window.print()}>Print / Save PDF</button>;}
