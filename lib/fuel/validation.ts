import {z} from "zod";
import {validDate, HABITS} from "./model";
const date=z.string().refine(validDate,"Use a real YYYY-MM-DD date.");
const nullableNumber=(max:number)=>z.number().finite().min(0).max(max).nullable();
const text=(max=2000)=>z.string().max(max);
const target=z.object({kcal:nullableNumber(10000),protein_g:nullableNumber(1000),carbs_g:nullableNumber(2000),fat_g:nullableNumber(1000)}).strict();
export const fuelPlanSchema=z.object({schema_version:z.literal(1),title:z.string().trim().min(3).max(120),goal:text(),start:date,end:date,event_date:date.nullable(),mode:z.enum(["habits","targets"]),habits:z.array(z.enum(HABITS)).max(6),phases:z.array(z.object({name:z.string().trim().min(1).max(80),start:date,end:date,focus:text(),training:target,rest:target}).strict()).min(1).max(12),meals:z.array(z.object({name:z.string().trim().min(1).max(120),day:z.enum(["training","rest","either"]),serving:text(1000),ingredients:z.array(text(200)).max(30),swaps:text(1000),targets:target}).strict()).max(30),grocery:z.array(text(200)).max(100),guidance:text(6000),review_on:date.nullable()}).strict().superRefine((plan,ctx)=>{
 if(plan.end<plan.start)ctx.addIssue({code:"custom",message:"Plan end precedes start."});
 if(new Set(plan.habits).size!==plan.habits.length)ctx.addIssue({code:"custom",message:"Habit selections must be unique."});
 const sorted=[...plan.phases].sort((a,b)=>a.start.localeCompare(b.start));
 sorted.forEach((phase,i)=>{if(phase.end<phase.start||phase.start<plan.start||phase.end>plan.end||(i>0&&phase.start<=sorted[i-1].end))ctx.addIssue({code:"custom",message:"Phases must be ordered, non-overlapping and inside the plan dates."});});
});
const score=nullableNumber(5).refine(v=>v===null||(Number.isInteger(v)&&v>=1),"Use 1–5 or leave blank.");
const daily=z.object({day_type:z.enum(["training","rest","unclassified"]),habits:z.object({protein:z.enum(["met","missed","not_due"]).nullable(),fuel:z.enum(["met","missed","not_due"]).nullable(),water:z.enum(["met","missed","not_due"]).nullable(),steps:z.enum(["met","missed","not_due"]).nullable(),sleep:z.enum(["met","missed","not_due"]).nullable(),training:z.enum(["met","missed","not_due"]).nullable()}).strict(),weight_lb:z.number().finite().positive().max(999).nullable(),steps:nullableNumber(200000).refine(v=>v===null||Number.isInteger(v)),sleep_hours:nullableNumber(24),energy:score,hunger:score,note:text()}).strict();
const weekly=z.object({hardest_moment:text(),barriers:text(),training:z.enum(["stronger","same","flat","not_reported"]),symptoms:text(),upcoming:text(),next_step:text(),contact_requested:z.boolean(),energy:score,hunger:score,sleep:score}).strict();
const uuid=z.string().uuid();const expected=z.number().int().min(0).max(1000000);const reason=z.string().trim().min(10).max(2000);
export const fuelCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("save_plan"),request_id:uuid,expected_revision:expected,content:fuelPlanSchema,origin:z.enum(["coach_authored","source_transcription","ai_proposed"]),source_reference:text(500)}).strict(),
 z.object({action:z.literal("release_plan"),request_id:uuid,version_id:uuid.nullable(),expected_sequence:expected,confirmed:z.literal(true),reason,individual_review_confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal("save_daily"),request_id:uuid,date,expected_revision:expected,plan_version_id:uuid.nullable(),payload:daily}).strict(),
 z.object({action:z.literal("save_checkin"),request_id:uuid,date,expected_revision:expected,plan_version_id:uuid.nullable(),payload:weekly}).strict(),
 z.object({action:z.literal("review_checkin"),request_id:uuid,entry_id:uuid,note:reason,disposition:z.enum(["reviewed","contact","referral"]),confirmed:z.literal(true)}).strict(),
 z.object({action:z.literal("record_body_comp"),request_id:uuid,date,weight_lb:z.number().finite().positive().max(999),body_fat_pct:nullableNumber(100),lean_mass_lb:nullableNumber(999),method:z.enum(["bod_pod","dexa","inbody","scale","calipers"]),source_kind:z.enum(["coach_measurement","source_transcription"]),source_reference:z.string().trim().min(3).max(500),protocol:text(2000),confirmed:z.literal(true)}).strict(),
]);
export type FuelCommand=z.infer<typeof fuelCommandSchema>;
export function parseFuelCommand(value:unknown):FuelCommand {const parsed=fuelCommandSchema.safeParse(value);if(!parsed.success)throw Error(parsed.error.issues.map(i=>i.message).slice(0,3).join(" "));return parsed.data;}
export function validFuelReceipt(value:unknown,command:FuelCommand,clientId:string):boolean {if(!value||typeof value!=="object")return false;const r=value as Record<string,unknown>;return r.ok===true&&r.request_id===command.request_id&&r.client_id===clientId&&r.action===command.action&&typeof r.entity_id==="string"&&uuid.safeParse(r.entity_id).success&&Number.isSafeInteger(r.revision)&&Number(r.revision)>0&&typeof r.deduped==="boolean";}
