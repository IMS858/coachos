import {libraryDraftRows} from "@/lib/programs/library-draft";

export type SessionPlanRow={
  key:string;
  exercise_id:string|null;
  name:string;
  block:string;
  prescription:{
    sets:number|null;
    reps:string;
    load:string;
    rpe:number|null;
    rest_seconds:number|null;
    tempo:string;
    cue:string;
  };
};

type AssignmentRow={
  id:string;exercise_id:string;block:string|null;position:number|null;sets:number|null;reps:string|null;
  load_prescription:string|null;rest_seconds:number|null;tempo:string|null;notes:string|null;
  exercises?:{name?:string|null;ims_label?:string|null}|null;
};

export function sessionPlanRows(programData:unknown,assignments:AssignmentRow[]):SessionPlanRow[]{
 const data=programData&&typeof programData==="object"&&!Array.isArray(programData)?programData as Record<string,unknown>:{};
 if(data.source==="ims_library_program"){
   return libraryDraftRows(data).map((row,index)=>({key:`quick:${index}:${row.canonical_id??row.exercise_id??"custom"}`,exercise_id:row.exercise_id,name:row.name,block:"training",prescription:{sets:row.sets,reps:row.reps,load:row.load,rpe:row.rpe,rest_seconds:row.rest_seconds,tempo:row.tempo,cue:row.cue}}));
 }
 return assignments.sort((a,b)=>(a.position??0)-(b.position??0)||a.id.localeCompare(b.id)).map(row=>({key:`assignment:${row.id}`,exercise_id:row.exercise_id,name:row.exercises?.ims_label||row.exercises?.name||"Exercise",block:row.block||"training",prescription:{sets:row.sets,reps:row.reps??"",load:row.load_prescription??"",rpe:null,rest_seconds:row.rest_seconds,tempo:row.tempo??"",cue:row.notes??""}}));
}

export function performanceChanged(input:{sets_completed:number|null;reps_completed:string;load_performed:string;rpe_actual:number|null;coach_note:string}):boolean{
 return input.sets_completed!==null||input.reps_completed.trim()!==""||input.load_performed.trim()!==""||input.rpe_actual!==null||input.coach_note.trim()!=="";
}
