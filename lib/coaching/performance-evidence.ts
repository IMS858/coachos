import {performedSummary,type PerformedValues} from "./session-execution";
export type PerformanceEvidence=Omit<PerformedValues,"coach_note"> & {id:string;session_id:string;exercise_id:string|null;exercise_name:string;performed_at:string};
/** Identity, distinct sessions and performed time define comparisons. Names are not identity. */
export function repeatedPerformance(rows:PerformanceEvidence[],now=new Date()){
 const groups=new Map<string,PerformanceEvidence[]>(),seen=new Set<string>();let excluded=0;
 for(const row of [...rows].sort((a,b)=>Date.parse(b.performed_at)-Date.parse(a.performed_at)||a.id.localeCompare(b.id))){
  const time=Date.parse(row.performed_at),key=`${row.exercise_id}:${row.session_id}`;
  if(!row.exercise_id||!Number.isFinite(time)||time>now.getTime()){excluded++;continue;}
  if(seen.has(key))continue;seen.add(key);groups.set(row.exercise_id,[...(groups.get(row.exercise_id)??[]),row]);
 }
 return {excluded,groups:[...groups.entries()].filter(([,records])=>records.length>=2).map(([exerciseId,records])=>({exerciseId,records,latest:records[0],prior:records[1],latestText:performedSummary(records[0]),priorText:performedSummary(records[1])}))};
}
export function performanceDays(rows:PerformanceEvidence[]){return new Set(rows.map(r=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles"}).format(new Date(r.performed_at)))).size;}
