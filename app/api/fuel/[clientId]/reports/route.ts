import {createHash} from 'node:crypto';
import {NextResponse,type NextRequest} from 'next/server';
import {createClient,createServiceClient} from '@/lib/supabase/server';
import {FUEL_UUID} from '@/lib/fuel/model';
import {readReport,reportExtension,REPORT_MIMES,type ReportMime} from '@/lib/fuel/report';
import {validSourceReceipt} from '@/lib/fuel/source';
export const runtime='nodejs';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){
 const {clientId}=await params,id=request.nextUrl.searchParams.get('id');if(!FUEL_UUID.test(clientId)||!id||!FUEL_UUID.test(id))return reply({error:'Invalid source.'},400);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Sign in required.'},401);const access=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(access.error)return reply({error:'Authorization unavailable.'},503);if(access.data!==true)return reply({error:'Assigned coach or owner required.'},403);
 const found=await db.from('fuel_source_documents').select('id,storage_path,content_type').eq('id',id).eq('client_id',clientId).maybeSingle();if(found.error)return reply({error:'Source lookup unavailable.'},503);if(!found.data)return reply({error:'Source not found.'},404);
 const mime=found.data.content_type as ReportMime;if(!REPORT_MIMES.includes(mime))return reply({error:'Unsupported source type.'},400);
 const svc=createServiceClient(),signed=await svc.storage.from('fuel-sources').createSignedUrl(found.data.storage_path,60,{download:`ims-body-composition-${id}.${reportExtension(mime)}`});if(signed.error||!signed.data?.signedUrl)return reply({error:'Source download unavailable.'},503);
 return NextResponse.redirect(signed.data.signedUrl,{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
export async function POST(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){
 const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:'Invalid client.'},400);if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Invalid origin.'},403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:'Sign in required.'},401);
 const allowed=await db.rpc('fuel_can_access',{p_client:clientId,p_staff_only:true});if(allowed.error)return reply({error:'Authorization unavailable.'},503);if(allowed.data!==true)return reply({error:'Assigned coach or owner required.'},403);
 const id=request.headers.get('x-source-id')??'';let name:string,original:Awaited<ReturnType<typeof readReport>>;
 try{name=decodeURIComponent(request.headers.get('x-source-name')??'').trim();if(!FUEL_UUID.test(id)||!name||name.length>160||[...name].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))throw Error('Invalid source identity.');original=await readReport(request);}catch(e){return reply({error:e instanceof Error?e.message:'Invalid original.'},400);}
 const {bytes,mime}=original,hash=createHash('sha256').update(bytes).digest('hex'),path=`${clientId}/${user.id}/${id}.${reportExtension(mime)}`;
 try{
  const existing=await db.from('fuel_source_documents').select('id,client_id,created_by,original_name,sha256,byte_size,content_type').eq('id',id).maybeSingle();if(existing.error)return reply({error:'Report storage unavailable; upload not attempted.'},503);
  if(existing.data){const r=existing.data;if(r.client_id!==clientId||r.created_by!==user.id||r.original_name!==name||r.sha256!==hash||r.byte_size!==bytes.length||r.content_type!==mime)return reply({error:'Source ID belongs to different content.'},409);return reply({ok:true,id,client_id:clientId,sha256:hash,byte_size:bytes.length,deduped:true});}
  const svc=createServiceClient(),bucket=svc.storage.from('fuel-sources'),upload=await bucket.upload(path,bytes,{contentType:mime,upsert:false});
  if(upload.error){const previous=await bucket.download(path);if(previous.error||!previous.data||previous.data.size!==bytes.length)return reply({error:'Upload unconfirmed. Retry this exact original.'},503);const prior=new Uint8Array(await previous.data.arrayBuffer());if(createHash('sha256').update(prior).digest('hex')!==hash)return reply({error:'Different bytes already occupy this source ID; no overwrite.'},409);}
  const saved=await svc.rpc('register_fuel_report_source',{p_actor:user.id,p_client:clientId,p_id:id,p_name:name,p_sha256:hash,p_bytes:bytes.length,p_mime:mime});
  if(saved.error||!validSourceReceipt(saved.data,id,clientId,hash,bytes.length))return reply({error:'Original may be stored, but registration is unconfirmed. Retry the identical upload.'},503);return reply(saved.data);
 }catch{return reply({error:'Upload unconfirmed. Retry the preserved original.'},503);}
}
