import {createHash} from 'node:crypto';
import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {smallJson} from '@/lib/media/request';
import {FUEL_UUID} from '@/lib/fuel/model';
import {REPORT_LIMIT,REPORT_MIMES,extractLocalImsBodPod,type ReportMime} from '@/lib/fuel/report';
import {extractReport,reportReaderConfigured} from '@/lib/fuel/report-provider';
export const runtime='nodejs';export const maxDuration=60;
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const schema=z.object({source_id:z.string().uuid(),request_id:z.string().uuid(),external_processing_consent:z.boolean().optional().default(false)}).strict();
export async function POST(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){
 const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:'Invalid client.'},400);if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Sign in required.'},401);const access=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(access.error)return reply({error:'Authorization unavailable.'},503);if(access.data!==true)return reply({error:'Assigned coach or owner required.'},403);
 let body:z.infer<typeof schema>;try{body=schema.parse(await smallJson(request,2048));}catch{return reply({error:'A private source and request identity are required.'},400);}
 const found=await db.from('fuel_source_documents').select('id,client_id,sha256,byte_size,storage_path,content_type').eq('id',body.source_id).eq('client_id',clientId).maybeSingle();if(found.error)return reply({error:'Source lookup unavailable.'},503);if(!found.data)return reply({error:'Source not found.'},404);const source=found.data;
 if(source.byte_size>REPORT_LIMIT||!REPORT_MIMES.includes(source.content_type as ReportMime))return reply({error:'Unsupported original.'},400);
 // Photos cannot use the first-party fillable-PDF parser. Reject before elevated
 // storage access unless the coach explicitly consented to assisted transcription.
 if(source.content_type!=='application/pdf'){
  if(!body.external_processing_consent)return reply({error:'Photos require explicit assisted-reading consent, or enter the result manually.'},422);
  if(!reportReaderConfigured())return reply({error:'Assisted report reading is not configured. Enter the results manually; the original is preserved.'},503);
 }
 try{
  const svc=createServiceClient(),stored=await svc.storage.from('fuel-sources').download(source.storage_path);if(stored.error||!stored.data||stored.data.size!==source.byte_size)return reply({error:'Original bytes unavailable.'},503);const bytes=new Uint8Array(await stored.data.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)return reply({error:'Original checksum mismatch. No extraction accepted.'},409);
  if(source.content_type==='application/pdf'){
   const local=extractLocalImsBodPod(bytes);
   if(local){
    const recheck=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(recheck.error||recheck.data!==true)return reply({error:'Authorization changed; extracted results were not returned.'},403);
    return reply({client_id:clientId,source_id:source.id,source_hash:source.sha256,request_id:body.request_id,reviewed:false,processor:'ims_local_form_v1',extracted:local});
   }
  }
  if(!body.external_processing_consent)return reply({error:'This file is not the exact fillable IMS results form. Enter the results manually, or explicitly allow assisted report reading for this source.'},422);
  if(!reportReaderConfigured())return reply({error:'Assisted report reading is not configured. Enter the results manually; the original is preserved.'},503);
  const reservation=await svc.rpc('reserve_fuel_report_read',{p_actor:user.id,p_client:clientId,p_source:source.id,p_request:body.request_id});if(reservation.error)return reply({error:'Reading was already attempted, access changed, or the hourly limit was reached. Enter results manually or explicitly start a new read later.'},429);
  const extracted=await extractReport(bytes,source.content_type as ReportMime);
  const recheck=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(recheck.error||recheck.data!==true)return reply({error:'Authorization changed; extracted results were not returned.'},403);
  return reply({client_id:clientId,source_id:source.id,source_hash:source.sha256,request_id:body.request_id,reviewed:false,processor:'assisted_reader',extracted});
 }catch{return reply({error:'Reading failed or returned an invalid result. No measurement or plan was saved. The original is preserved; manually confirm the fields or start a new read.'},503);}
}
