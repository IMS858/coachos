import { libraryDraftRows } from "../programs/library-draft";
import { parsePrescription, type ExercisePrescription } from "../exercises/prescription";
export type SessionPlanRow = { key:string; exercise_id:string|null; name:string; block:string; prescription:ExercisePrescription };
export type AssignmentRow = { id:string;exercise_id:string;block:string|null;position:number|null;sets:number|null;reps:string|null;load_prescription:string|null;rest_seconds:number|null;tempo:string|null;notes:string|null;exercises?:{name?:string|null;ims_label?:string|null}|null };
export type PerformedValues = { sets_completed:number|null;reps_completed:string;load_performed:string;rpe_actual:number|null;coach_note:string };
export type PerformanceRecord = PerformedValues & {id:string;session_id:string;prescription_key:string;exercise_id:string|null;exercise_name:string;prescription_snapshot:unknown;updated_at:string;performed_at:string};
export const EMPTY_PERFORMED:PerformedValues = {sets_completed:null,reps_completed:"",load_performed:"",rpe_actual:null,coach_note:""};
const blocks=["warmup","main","finisher","cooldown"];
const blockRank=(block:string|null)=>{const rank=blocks.indexOf(block??"");return rank<0?blocks.length:rank;};
export function sessionPlanRows(programData:unknown,assignments:AssignmentRow[]):SessionPlanRow[]{
 const data=programData&&typeof programData==="object"&&!Array.isArray(programData)?programData as Record<string,unknown>:{};
 if(data.source==="ims_library_program")return libraryDraftRows(data).map((row,index)=>({key:`quick:${index}:${row.canonical_id??row.exercise_id??"custom"}`,exercise_id:row.exercise_id,name:row.name,block:"training",prescription:{sets:row.sets,reps:row.reps,load:row.load,rpe:row.rpe,rest_seconds:row.rest_seconds,tempo:row.tempo,cue:row.cue}}));
 if(data.source==="ims_exercise_set")return [];
 return [...assignments].sort((a,b)=>blockRank(a.block)-blockRank(b.block)||(a.position??0)-(b.position??0)||a.id.localeCompare(b.id)).map(row=>({key:`assignment:${row.id}`,exercise_id:row.exercise_id,name:row.exercises?.ims_label||row.exercises?.name||"Exercise",block:row.block||"training",prescription:{sets:row.sets,reps:row.reps??"",load:row.load_prescription??"",rpe:null,rest_seconds:row.rest_seconds,tempo:row.tempo??"",cue:row.notes??""}}));
}
export function parsePerformedValues(value:unknown):PerformedValues{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid performed result.");
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!Object.hasOwn(EMPTY_PERFORMED,k)))throw new Error("Only actual performance fields may be recorded.");
 const text=(key:string,max:number)=>{if(typeof v[key]!=="string"||(v[key] as string).length>max)throw new Error(`Invalid ${key}.`);return (v[key] as string).trim();};
 const number=(key:string,min:number,max:number,integer:boolean)=>{const n=v[key];if(n===null)return null;if(typeof n!=="number"||!Number.isFinite(n)||n<min||n>max||(integer?!Number.isInteger(n):Math.abs(n*10-Math.round(n*10))>1e-8))throw new Error(`Invalid ${key}.`);return n;};
 const result={sets_completed:number("sets_completed",0,30,true),reps_completed:text("reps_completed",80),load_performed:text("load_performed",160),rpe_actual:number("rpe_actual",1,10,false),coach_note:text("coach_note",1000)};
 if(!performanceChanged(result))throw new Error("Enter what actually happened. An empty row is not a performed result.");
 return result;
}
export function performanceChanged(v:PerformedValues):boolean{return v.sets_completed!==null||v.reps_completed.trim()!==""||v.load_performed.trim()!==""||v.rpe_actual!==null||v.coach_note.trim()!=="";}
export function performedSignature(v:PerformedValues):string{return JSON.stringify([v.sets_completed,v.reps_completed,v.load_performed,v.rpe_actual,v.coach_note]);}
export function performedSummary(v:Omit<PerformedValues,"coach_note">):string{return [v.sets_completed===null?"":`${v.sets_completed} sets`,v.reps_completed,v.load_performed,v.rpe_actual===null?"":`RPE ${v.rpe_actual}`].filter(Boolean).join(" · ")||"Observation only; no dosage recorded";}
/** Once logged, the displayed plan is the frozen source snapshot, not a later program edit. */
export function executionRows(current:SessionPlanRow[],saved:PerformanceRecord[]):SessionPlanRow[]{
 const frozen=(r:PerformanceRecord):SessionPlanRow=>{
  if(!r.prescription_snapshot||typeof r.prescription_snapshot!=="object"||Array.isArray(r.prescription_snapshot))throw new Error("Saved prescription evidence is invalid.");
  const p=r.prescription_snapshot as Record<string,unknown>;
  return {key:r.prescription_key,exercise_id:r.exercise_id,name:r.exercise_name,block:typeof p.block==="string"?p.block:"training",prescription:parsePrescription({sets:p.sets,reps:p.reps,load:p.load,rpe:p.rpe,rest_seconds:p.rest_seconds,tempo:p.tempo,cue:p.cue})};
 };
 const records=new Map(saved.map(r=>[r.prescription_key,r]));
 return [...current.map(r=>records.has(r.key)?frozen(records.get(r.key)!):r),...saved.filter(r=>!current.some(c=>c.key===r.prescription_key)).map(frozen)];
}
