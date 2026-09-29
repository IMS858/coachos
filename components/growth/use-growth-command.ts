"use client";
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {growthCommandSchema,type GrowthCommand} from '@/lib/growth/commands';
import {FUEL_UUID} from '@/lib/fuel/model';
type WithoutRequest<T>=T extends unknown?Omit<T,'request_id'>:never;
export function useGrowthCommand(){const router=useRouter(),pending=useRef<GrowthCommand|null>(null),lock=useRef(false),ambiguous=useRef(false),done=useRef(false);const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState<string|null>(null);
 async function send(c:GrowthCommand){if(lock.current||done.current)return;lock.current=true;setBusy(true);setError(null);try{const response=await fetch('/api/growth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}),r=await response.json().catch(()=>null);if(!response.ok){if(response.status>=500||ambiguous.current){ambiguous.current=true;setUncertain(true);}else pending.current=null;setError(r?.error??'Growth save not confirmed.');return;}if(r?.ok!==true||r.request_id!==c.request_id||r.action!==c.action||typeof r.id!=='string'||!FUEL_UUID.test(r.id)||typeof r.updated_at!=='string'||!Number.isFinite(Date.parse(r.updated_at))||typeof r.deduped!=='boolean'){ambiguous.current=true;setUncertain(true);setError('Incomplete growth receipt. Retry the same request.');return;}pending.current=null;done.current=true;setSaved(true);setUncertain(false);router.refresh();}catch{ambiguous.current=true;setUncertain(true);setError('Connection interrupted. Keep the exact request and retry; do not duplicate the expense or review.');}finally{lock.current=false;setBusy(false);}}
 async function run(make:()=>WithoutRequest<GrowthCommand>){if(lock.current||pending.current||done.current)return;try{const c=growthCommandSchema.parse({...make(),request_id:crypto.randomUUID()});pending.current=c;await send(c);}catch(e){setError(e instanceof Error&&!e.message.startsWith('[')?e.message:'Review the required growth fields.');}}
 return {run,retry:()=>pending.current?send(pending.current):Promise.resolve(),busy,uncertain,saved,error,locked:busy||uncertain||saved};
}
