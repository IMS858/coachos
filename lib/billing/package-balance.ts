export type PackageEvidence={kind:string;total_sessions:number|null;sessions_used:number|null;current_session_number:number|null};
export type PackageBalance={state:"membership"}|{state:"unknown"}|{state:"known";total:number;used:number;remaining:number};
/** Unknown or conflicting counters must not imply zero usage or a full package. */
export function packageBalance(p:PackageEvidence):PackageBalance {
  if(p.kind!=="package")return {state:"membership"};
  const total=p.total_sessions,used=p.sessions_used,legacy=p.current_session_number;
  if(total===null||used===null||legacy===null||!Number.isSafeInteger(total)||!Number.isSafeInteger(used)||!Number.isSafeInteger(legacy)||total<1||used<0||used!==legacy)return {state:"unknown"};
  return {state:"known",total,used,remaining:Math.max(0,total-used)};
}
