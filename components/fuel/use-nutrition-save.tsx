"use client";
import {useRef,useState} from 'react';
import {nutritionRequestSchema,validNutritionReceipt,type NutritionRequest} from '@/lib/fuel/nutrition-request';
export function useNutritionSave(clientId:string){
 const lock=useRef(false),pending=useRef<NutritionRequest|null>(null),ambiguous=useRef(false),done=useRef(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[version,setVersion]=useState<string|null>(null);
 async function send(body:Extract<NutritionRequest,{action:'save'}>){if(lock.current||done.current)return;lock.current=true;setBusy(true);setError(null);
  try{const response=await fetch(`/api/fuel/${clientId}/nutrition`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json().catch(()=>null);
   if(!response.ok){if(response.status>=500||ambiguous.current){ambiguous.current=true;setUncertain(true);}else pending.current=null;setError(result?.error??'Save not confirmed.');return;}
   if(!validNutritionReceipt(result,body.request_id,body.measurement_request_id,clientId)){ambiguous.current=true;setUncertain(true);setError('Incomplete receipt; retry the preserved save.');return;}
   done.current=true;pending.current=null;setUncertain(false);setVersion(result.strategy.entity_id);
  }catch{ambiguous.current=true;setUncertain(true);setError('Connection interrupted. Retry the exact save; do not create a second baseline.');}finally{lock.current=false;setBusy(false);}
 }
 async function save(value:unknown){if(lock.current||pending.current||done.current)return;const parsed=nutritionRequestSchema.safeParse(value);if(!parsed.success||parsed.data.action!=='save'){setError('Review the draft inputs.');return;}pending.current=parsed.data;await send(parsed.data);}
 return {save,retry:()=>pending.current?.action==='save'?send(pending.current):Promise.resolve(),busy,uncertain,error,version,locked:busy||uncertain||Boolean(version)};
}
