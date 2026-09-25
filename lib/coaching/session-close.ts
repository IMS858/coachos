export type ResultsSaveReceipt = {ok:boolean;saved:number;failed:number;error?:string};
export type CloseStage = "results"|"notes"|"completion";
export type CloseReceipt = {ok:boolean;stage:CloseStage;savedResults:number;notesSaved:boolean;error?:string;completion?:Record<string,unknown>};
export type SessionNotes = {notes_pre:string|null;notes_post:string|null};

/** Never coerce an HTTP 200, empty body, or truthy payload into a successful action. */
export function requireConfirmedAction(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value)||(value as Record<string,unknown>).ok!==true)throw new Error("Session action was not confirmed. Check the session before retrying.");
 return value as Record<string,unknown>;
}
export function parseSessionNotes(value:unknown):SessionNotes{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid session note snapshot.");
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==2||!Object.hasOwn(v,"notes_pre")||!Object.hasOwn(v,"notes_post"))throw new Error("Both original note fields are required.");
 for(const key of ["notes_pre","notes_post"]){if(v[key]!==null&&(typeof v[key]!=="string"||(v[key] as string).length>4000))throw new Error("Session notes must be text under 4,000 characters.");}
 return {notes_pre:v.notes_pre as string|null,notes_post:v.notes_post as string|null};
}
export function sameSessionNotes(a:SessionNotes,b:SessionNotes):boolean{return a.notes_pre===b.notes_pre&&a.notes_post===b.notes_post;}

/** Each result uses the existing atomic performance RPC. This batch reports partial saves honestly. */
export async function saveResultBatch<T>(items:readonly T[],persist:(item:T)=>Promise<void>,onError:(item:T,error:string)=>void):Promise<ResultsSaveReceipt>{
 let saved=0,failed=0;
 for(const item of items){try{await persist(item);saved++;}catch(cause){failed++;onError(item,cause instanceof Error?cause.message:"Result save was not confirmed.");}}
 return {ok:failed===0,saved,failed,...(failed?{error:`${failed} exercise result${failed===1?"":"s"} could not be saved. Review the highlighted rows; completion was not attempted.`}:{})};
}
/** This is an ordered save workflow, not a claim that separate requests form one transaction. */
export async function closeSessionLoop(steps:{saveResults:()=>Promise<ResultsSaveReceipt>;persistNotes:()=>Promise<boolean>;complete:()=>Promise<unknown>}):Promise<CloseReceipt>{
 let stage:CloseStage="results",savedResults=0,notesSaved=false;
 try{
  const results=await steps.saveResults();savedResults=results.saved;
  if(!results.ok||results.failed>0)throw new Error(results.error||"Exercise results are not saved. Completion was not attempted.");
  stage="notes";notesSaved=await steps.persistNotes();
  stage="completion";const completion=requireConfirmedAction(await steps.complete());
  return {ok:true,stage,savedResults,notesSaved,completion};
 }catch(cause){return {ok:false,stage,savedResults,notesSaved,error:cause instanceof Error?cause.message:"Session close was not confirmed."};}
}
export function remainingRestSeconds(deadline:number,now:number):number{
 if(!Number.isFinite(deadline)||!Number.isFinite(now))throw new Error("Valid timer timestamps required.");
 return Math.max(0,Math.ceil((deadline-now)/1000));
}
