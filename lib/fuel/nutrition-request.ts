import {z} from 'zod';
import {measureSchema} from './report';
import {nutritionIntakeSchema} from './nutrition';
import {fuelPlanSchema} from './validation';
export const sourceReferenceSchema=z.object({id:z.string().uuid(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const common={measurement:measureSchema,intake:nutritionIntakeSchema,sources:z.array(sourceReferenceSchema).min(1).max(3),same_person_test_confirmed:z.literal(true),reported_values_confirmed:z.literal(true)};
export const nutritionRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('propose'),...common}).strict(),
 z.object({action:z.literal('save'),...common,content:fuelPlanSchema,expected_revision:z.number().int().min(0).max(1000000),request_id:z.string().uuid(),measurement_request_id:z.string().uuid(),strategy_reviewed:z.literal(true)}).strict(),
]);
export type NutritionRequest=z.infer<typeof nutritionRequestSchema>;
export function validNutritionReceipt(value:unknown,requestId:string,measurementRequestId:string,clientId:string):boolean{
 if(!value||typeof value!=='object')return false;const r=value as Record<string,any>;
 const receipt=(v:any,action:string,id:string)=>Boolean(v&&v.ok===true&&v.action===action&&v.request_id===id&&v.client_id===clientId&&z.string().uuid().safeParse(v.entity_id).success&&Number.isSafeInteger(v.revision)&&v.revision>0&&typeof v.deduped==='boolean');
 return r.ok===true&&r.client_id===clientId&&receipt(r.measurement,'record_body_comp',measurementRequestId)&&receipt(r.strategy,'save_plan',requestId);
}
