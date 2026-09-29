import {CONNECTORS,ROW_LIMIT,priorWindow,querySpecs,validateBundle,type AcquisitionSource,type AcquisitionBundle,type AcquisitionReport,type QuerySpec} from './model';
const BASE='https://connectors.windsor.ai';
export function acquisitionProviderReady(){return Boolean(process.env.WINDSOR_API_KEY?.trim());}
/** Windsor's documented Connectors API only supports a query credential. Never log the URL, fetch exception or provider body; never send it to a browser. */
async function readJson(response:Response):Promise<unknown>{if(!response.ok)throw Error(response.status===401||response.status===403?'provider_authorization':response.status===429?'provider_rate_limit':'provider_unavailable');if(!response.body)throw Error('provider_empty');const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>1500000){await reader.cancel();throw Error('provider_oversized');}chunks.push(item.value);}}finally{reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export function providerRows(value:unknown):Record<string,unknown>[]{const v=value as Record<string,unknown>|null;const rows=Array.isArray(value)?value:Array.isArray(v?.data)?v.data:Array.isArray(v?.result)?v.result:null;if(!rows||v&&!Array.isArray(value)&&v.error)throw Error('provider_invalid_response');if(rows.length>ROW_LIMIT||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('provider_invalid_response');return rows;}
const errors=new Set(['provider_authorization','provider_rate_limit','provider_unavailable','provider_empty','provider_oversized','provider_invalid_response']);
async function readReport(source:AcquisitionSource,spec:QuerySpec,start:string,end:string):Promise<AcquisitionReport>{
 const range=spec.period==='previous'?priorWindow(start,end):{start,end};
 try{const url=new URL(BASE+'/'+source.connector);url.searchParams.set('api_key',process.env.WINDSOR_API_KEY!.trim());url.searchParams.set('select_accounts',source.account_id);url.searchParams.set('fields',spec.fields.join(','));url.searchParams.set('date_from',range.start);url.searchParams.set('date_to',range.end);url.searchParams.set('_max_rows',String(ROW_LIMIT));url.searchParams.set('_renderer','json');if(spec.filters)url.searchParams.set('filter',JSON.stringify(spec.filters));if(source.connector==='searchconsole')url.searchParams.set('include_fresh_data','false');
  const raw=providerRows(await readJson(await fetch(url,{method:'GET',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.timeout(18000)})));
  // Pick only declared aggregate fields. Ignore extra provider metadata; do not retain event parameters or user-level records.
  const rows=raw.map(row=>Object.fromEntries(spec.fields.map(field=>[field,row[field]??null])));
  return {...spec,status:rows.length===ROW_LIMIT?'limited':rows.length?'available':'empty',rows:rows as AcquisitionReport['rows'],note:spec.note+(rows.length===ROW_LIMIT?' Provider row ceiling reached; this breakdown is incomplete.':'')};
 }catch(e){const reason=e instanceof Error&&errors.has(e.message)?e.message:'provider_read_failed';return {kind:spec.kind,period:spec.period,fields:spec.fields,status:'unavailable',rows:[],note:spec.note+' '+reason+'. Previous snapshots remain stored.'};}
}
export async function readAcquisition(source:AcquisitionSource,start:string,end:string,now=new Date()):Promise<AcquisitionBundle>{
 if(!acquisitionProviderReady()||!CONNECTORS.includes(source.connector))throw Error('Read-only analytics is not configured.');
 const specs=querySpecs(source.connector),reports:AcquisitionReport[]=[];
 // At most three concurrent reads, with bounded responses and no provider writes.
 for(let offset=0;offset<specs.length;offset+=3){const next=await Promise.all(specs.slice(offset,offset+3).map(spec=>readReport(source,spec,start,end)));reports.push(...next.map(({kind,period,fields,status,rows,note})=>({kind,period,fields,status,rows,note})));}
 return validateBundle({version:1,start,end,observed_at:now.toISOString(),reports},source.connector,source.account_id,now);
}
