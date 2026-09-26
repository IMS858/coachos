export const HISTORICAL_SESSION_ESTIMATE_CENTS=9300;
export type HistoricalSessionEvidence={source_id:string;starts_at:string;status:string;service:string;duration_minutes:number|null};
export type HistoricalValueRow={source_id:string;estimated_value_cents:number;basis:"historical_session_estimate";rate_cents:number};
const training=(v:string)=>/personal training|training/i.test(v);
export function estimateHistoricalTrainingValue(rows:HistoricalSessionEvidence[],cutoverIso:string):HistoricalValueRow[]{const cutover=Date.parse(cutoverIso);return rows.filter(r=>Number.isFinite(Date.parse(r.starts_at))&&Date.parse(r.starts_at)<cutover&&training(r.service)&&!/cancel|no.?show|request/i.test(r.status)).map(r=>({source_id:r.source_id,estimated_value_cents:HISTORICAL_SESSION_ESTIMATE_CENTS,basis:"historical_session_estimate",rate_cents:HISTORICAL_SESSION_ESTIMATE_CENTS}));}
export function sumHistoricalEstimate(rows:HistoricalValueRow[]){return rows.reduce((n,r)=>n+r.estimated_value_cents,0);}
