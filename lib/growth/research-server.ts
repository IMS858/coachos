import {createServiceClient,type createClient} from '@/lib/supabase/server';
import {allCatalogPages} from '@/lib/exercises/catalog';
import {researchEvidence} from './model';
import {beginResearch,readResearch,completedResearch,researchResponseIdentity,researchProviderReady,safeProviderFailure} from './research-provider';
import {DEFAULT_RESEARCH_SETTINGS,organizationDomain,type ResearchRun,type ResearchControl} from './research-engine';
export type ResearchDb=Awaited<ReturnType<typeof createClient>>;
export async function researchSnapshot(db:ResearchDb){
 const month=new Date().toISOString().slice(0,7)+'-01T00:00:00.000Z';
 const [settings,runs,monthRuns]=await Promise.all([db.from('growth_research_settings').select('owner_id,revision,config').eq('singleton',true).maybeSingle(),db.from('growth_research_runs').select('*').order('created_at',{ascending:false}).limit(20),allCatalogPages<{id:string;reserved_cents:number;created_at:string}>((a,b)=>db.from('growth_research_runs').select('id,reserved_cents,created_at',{count:'exact'}).gte('created_at',month).order('id').range(a,b))]);
 if(settings.error||runs.error)throw Error('Research storage is not ready. No empty run history was inferred.');
 return {control:(settings.data??{revision:0,owner_id:null,config:DEFAULT_RESEARCH_SETTINGS}) as ResearchControl,runs:(runs.data??[]) as ResearchRun[],monthRuns:monthRuns.length,reservedCents:monthRuns.reduce((s,r)=>s+r.reserved_cents,0),providerReady:researchProviderReady()};
}
async function runRecord(db:ResearchDb,id:string){const r=await db.from('growth_research_runs').select('*').eq('id',id).maybeSingle();if(r.error||!r.data)throw Error('Research run unavailable.');return r.data as ResearchRun;}
async function record(svc:ReturnType<typeof createServiceClient>,run:ResearchRun,status:string,response:string|null,result:unknown={},error:string|null=null){const saved=await svc.rpc('record_growth_research_result',{p_actor:run.owner_id,p_run:run.id,p_response:response,p_status:status,p_result:result,p_error:error});if(saved.error||saved.data?.ok!==true||saved.data.id!==run.id)throw Error('Research result save is unconfirmed. Refresh this run; do not create another provider request.');return saved.data;}
export async function startResearch(db:ResearchDb,owner:string,id:string,revision:number,origin:'manual'|'radar',environment:'preview'|'production'){
 if(!researchProviderReady())throw Error('Research provider is not configured. No paid request started.');
 // Only public organization domains are sent as exclusions; no CRM contact, health or payment records are sent.
 const previous=await allCatalogPages<{notes:string|null}>((a,b)=>db.from('leads').select('notes',{count:'exact'}).eq('source','agent_research').order('id').range(a,b));
 const exclusions=previous.flatMap(row=>{const e=researchEvidence(row.notes),d=e&&organizationDomain(e.website_url);return d?[d]:[];}).slice(0,100);
 const svc=createServiceClient(),reserved=await svc.rpc('reserve_growth_research',{p_actor:owner,p_request:id,p_revision:revision,p_environment:environment,p_origin:origin});
 if(reserved.error)throw Error(['54000','40001'].includes(reserved.error.code)?'Run already active, configuration changed, or research allowance reached. Refresh Research Desk.':'Research reservation rejected. Confirm active owner settings.');
 if(reserved.data?.ok!==true||reserved.data.id!==id||typeof reserved.data.dispatch!=='boolean')throw Error('Reservation receipt unconfirmed. Retry this exact request.');
 const run=await runRecord(db,id);if(!reserved.data.dispatch)return run;
 let response:Record<string,any>;
 try{response=await beginResearch(run.config,exclusions,new Date().toISOString().slice(0,10));researchResponseIdentity(response);}catch{await record(svc,run,'unconfirmed',null,{},'dispatch_unconfirmed');return runRecord(db,id);}
 // Store the upstream identity before processing its output. Lost output saves can recover without paying for another run.
 await record(svc,run,'researching',response.id);return pollResearch(db,id,response);
}
export async function pollResearch(db:ResearchDb,id:string,provided?:Record<string,any>,cancel=false){
 const run=await runRecord(db,id);if(['completed','failed','cancelled'].includes(run.status))return run;
 if(!run.response_id)return run; // Unknown submission must not be resubmitted.
 const response=provided??await readResearch(run.response_id,cancel);
 if(researchResponseIdentity(response)!==run.response_id)throw Error('Provider response identity did not match this run.');
 const svc=createServiceClient();
 if(cancel){if(response.status!=='cancelled')throw Error('Provider did not confirm cancellation. Refresh this run.');await record(svc,run,'cancelled',run.response_id,{},'owner_cancelled');}
 else if(response.status==='completed'){
  let result;try{result=completedResearch(response,run.config,new Date().toISOString().slice(0,10));}catch{await record(svc,run,'failed',run.response_id,{},'unusable_source_evidence');return runRecord(db,id);}
  await record(svc,run,'completed',run.response_id,result);
 }else if(['failed','incomplete','cancelled'].includes(response.status)){await record(svc,run,response.status==='cancelled'?'cancelled':'failed',run.response_id,{},response.status==='cancelled'?'owner_cancelled':safeProviderFailure(response));}
 else if(!['queued','in_progress'].includes(response.status))throw Error('Unknown provider state. Refresh this run without starting another.');
 return runRecord(db,id);
}
