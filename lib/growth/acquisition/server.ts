import {createServiceClient,type createClient} from '@/lib/supabase/server';
import {allCatalogPages} from '@/lib/exercises/catalog';
import {acquisitionProviderReady,readAcquisition} from './provider';
import {CONNECTORS,validateBundle,type AcquisitionSource,type AcquisitionTask,type Connector,type Snapshot} from './model';
type Db=Awaited<ReturnType<typeof createClient>>;
const SOURCE_COLUMNS='connector,account_id,label,hosts,brand_terms,daily_sync,sync_owner_id,revision,updated_at';
const SNAPSHOT_COLUMNS='id,connector,account_id,origin,payload,fingerprint,created_at';
export type RefreshRecord={id:string;connector:Connector;start_on:string;end_on:string;status:string;error_code:string|null;snapshot_id:string|null;created_at:string;finished_at:string|null};
export async function loadAcquisition(db:Db){
 const sourceResult=await db.from('growth_acquisition_sources').select(SOURCE_COLUMNS).order('connector');if(sourceResult.error)throw Error('Acquisition storage is unavailable.');
 const sources=sourceResult.data as AcquisitionSource[],snapshots:Snapshot[]=[];
 for(const source of sources){const q=await db.from('growth_acquisition_snapshots').select(SNAPSHOT_COLUMNS).eq('connector',source.connector).eq('account_id',source.account_id).order('created_at',{ascending:false}).order('id').limit(1).maybeSingle();if(q.error)throw Error('Snapshot history is unavailable.');if(q.data){const row=q.data as Snapshot;snapshots.push({...row,payload:validateBundle(row.payload,source.connector,source.account_id)});}}
 const [tasks,refreshes]=await Promise.all([allCatalogPages<AcquisitionTask>((a,b)=>db.from('growth_acquisition_tasks').select('id,title,kind,evidence,snapshot_ids,status,due_on,note,revision,updated_at',{count:'exact'}).order('id').range(a,b)),db.from('growth_acquisition_refreshes').select('id,connector,start_on,end_on,status,error_code,snapshot_id,created_at,finished_at').order('created_at',{ascending:false}).limit(12)]);
 if(refreshes.error)throw Error('Refresh history unavailable.');return {sources,snapshots,tasks,refreshes:refreshes.data as RefreshRecord[],runtimeReady:acquisitionProviderReady()};
}
export type AcquisitionData=Awaited<ReturnType<typeof loadAcquisition>>;
export async function refreshAcquisition(db:Db,actor:string,requestId:string,connector:Connector,start:string,end:string,origin:'manual_refresh'|'scheduled_refresh'='manual_refresh'){
 if(!CONNECTORS.includes(connector)||!acquisitionProviderReady())throw Error('The app needs its own read-only Windsor connection. No source read was started.');
 const sourceResult=await db.from('growth_acquisition_sources').select(SOURCE_COLUMNS).eq('connector',connector).maybeSingle();if(sourceResult.error||!sourceResult.data)throw Error('Source configuration unavailable.');
 const source=sourceResult.data as AcquisitionSource,svc=createServiceClient();
 const reservation=await svc.rpc('reserve_acquisition_refresh',{p_actor:actor,p_request:requestId,p_connector:connector,p_start:start,p_end:end,p_origin:origin});
 if(reservation.error)throw Error('Refresh already running, source settings changed, or the 24-hour refresh allowance was reached. Refresh the page before trying again.');
 if(reservation.data?.ok!==true||reservation.data.id!==requestId||typeof reservation.data.dispatch!=='boolean')throw Error('Refresh reservation unconfirmed. Retry this exact request.');
 if(reservation.data.dispatch){let payload;try{payload=await readAcquisition(source,start,end);}catch{const failed=await svc.rpc('finish_acquisition_refresh',{p_actor:actor,p_request:requestId,p_payload:null,p_error:'invalid_source_evidence'});if(failed.error)throw Error('Refresh save unconfirmed. Recover this request before starting another.');}
  if(payload){const done=await svc.rpc('finish_acquisition_refresh',{p_actor:actor,p_request:requestId,p_payload:payload,p_error:null});if(done.error||done.data?.id!==requestId)throw Error('Snapshot save unconfirmed. Recover this same refresh; do not duplicate it.');}
 }
 const result=await db.from('growth_acquisition_refreshes').select('id,connector,start_on,end_on,status,error_code,snapshot_id,created_at,finished_at').eq('id',requestId).maybeSingle();if(result.error||!result.data)throw Error('Refresh receipt unavailable.');return result.data as RefreshRecord;
}
