"use client";
import type { ExercisePrescription } from "@/lib/exercises/prescription";
export function ExercisePrescriptionFields({value,onChange,disabled=false,label,idPrefix}:{value:ExercisePrescription;onChange:(value:ExercisePrescription)=>void;disabled?:boolean;label:string;idPrefix:string}){
  const input="mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky";
  const fields=[
    {key:"sets",label:"Sets",numeric:true,min:1,max:20,step:1,placeholder:"e.g. 3"},
    {key:"reps",label:"Reps / time",numeric:false,maxLength:40,placeholder:"e.g. 8–10 or 30s"},
    {key:"load",label:"Load",numeric:false,maxLength:120,placeholder:"e.g. 25 lb / bodyweight"},
    {key:"rpe",label:"Target RPE",numeric:true,min:1,max:10,step:0.5,placeholder:"1–10"},
    {key:"rest_seconds",label:"Rest · seconds",numeric:true,min:0,max:900,step:1,placeholder:"e.g. 60"},
    {key:"tempo",label:"Tempo",numeric:false,maxLength:40,placeholder:"e.g. 3-1-1-0"},
  ] as const;
  return <fieldset disabled={disabled} className="grid grid-cols-2 gap-3"><legend className="sr-only">Prescription for {label}</legend>{fields.map(f=><label key={f.key} htmlFor={`${idPrefix}-${f.key}`} className="text-xs font-semibold text-cream-dim">{f.label}<input id={`${idPrefix}-${f.key}`} className={input} type={f.numeric?"number":"text"} inputMode={f.numeric?"decimal":undefined} min={f.numeric?f.min:undefined} max={f.numeric?f.max:undefined} step={f.numeric?f.step:undefined} maxLength={!f.numeric?f.maxLength:undefined} placeholder={f.placeholder} value={value[f.key]??""} onChange={e=>onChange({...value,[f.key]:f.numeric?e.target.value===""?null:Number(e.target.value):e.target.value})}/></label>)}<label htmlFor={`${idPrefix}-cue`} className="col-span-2 text-xs font-semibold text-cream-dim">Client cue / coaching note<textarea id={`${idPrefix}-cue`} className={input} maxLength={500} rows={2} value={value.cue} onChange={e=>onChange({...value,cue:e.target.value})} placeholder="What you want this client to focus on"/></label></fieldset>;
}
