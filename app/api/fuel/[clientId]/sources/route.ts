import {createHash} from "node:crypto";
import {NextResponse,type NextRequest} from "next/server";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {FUEL_UUID} from "@/lib/fuel/model";
import {readFuelPdf,validSourceReceipt} from "@/lib/fuel/source";
export const runtime="nodejs";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function access(clientId:string){const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return {error:reply({error:"Sign in required."},401)};const allowed=await db.rpc("fuel_can_access",{p_client:clientId,p_staff_only:true});if(allowed.error)return {error:reply({error:"Source authorization unavailable; database rollout may be required."},503)};if(allowed.data!==true)return {error:reply({error:"Assigned coach or owner required."},403)};return {db,user};}
export async function GET(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:"Invalid client."},400);const auth=await access(clientId);if(auth.error)return auth.error;const sourceId=request.nextUrl.searchParams.get("id");if(sourceId&&!FUEL_UUID.test(sourceId))return reply({error:"Invalid source."},400);
 if(sourceId){const found=await auth.db!.from("fuel_source_documents").select("id,storage_path").eq("id",sourceId).eq("client_id",clientId).maybeSingle();if(found.error)return reply({error:"Source record unavailable."},503);if(!found.data)return reply({error:"Source not found."},404);const svc=createServiceClient(),signed=await svc.storage.from("fuel-sources").createSignedUrl(found.data.storage_path,60,{download:`ims-source-${sourceId}.pdf`});if(signed.error||!signed.data?.signedUrl)return reply({error:"Source download unavailable."},503);return NextResponse.redirect(signed.data.signedUrl,{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});}
 const rows=await auth.db!.from("fuel_source_documents").select("id,original_name,sha256,byte_size,created_at",{count:"exact"}).eq("client_id",clientId).order("created_at",{ascending:false}).order("id").limit(100);if(rows.error||rows.count===null||!rows.data)return reply({error:"Source history unavailable."},503);return reply({sources:rows.data,total:rows.count,limit:100});
}
export async function POST(request:NextRequest,{params}:{params:Promise<{clientId:string}>}){const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:"Invalid client."},400);if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin."},403);const auth=await access(clientId);if(auth.error)return auth.error;
 const id=request.headers.get("x-source-id")??"";let name:string,bytes:Uint8Array;
 try{name=decodeURIComponent(request.headers.get("x-source-name")??"").trim();const controlCharacter=[...name].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127);if(!FUEL_UUID.test(id)||!name||name.length>160||controlCharacter)throw Error("Invalid original file identity.");bytes=await readFuelPdf(request);}catch(cause){return reply({error:cause instanceof Error?cause.message:"Invalid PDF upload."},400);}
 const hash=createHash("sha256").update(bytes).digest("hex"),path=`${clientId}/${auth.user!.id}/${id}.pdf`;
 try{
  const existing=await auth.db!.from("fuel_source_documents").select("id,client_id,created_by,original_name,sha256,byte_size").eq("id",id).maybeSingle();if(existing.error)return reply({error:"Source registry unavailable. Upload was not attempted."},503);
  if(existing.data){const p=existing.data;if(p.client_id!==clientId||p.created_by!==auth.user!.id||p.original_name!==name||p.sha256!==hash||p.byte_size!==bytes.byteLength)return reply({error:"Source identity already refers to different content."},409);return reply({ok:true,id,client_id:clientId,sha256:hash,byte_size:bytes.byteLength,deduped:true});}
  const svc=createServiceClient(),bucket=svc.storage.from("fuel-sources"),upload=await bucket.upload(path,bytes,{contentType:"application/pdf",upsert:false});
  if(upload.error){const stored=await bucket.download(path);if(stored.error||!stored.data)return reply({error:"Original upload unconfirmed. Retry the same file and request."},503);const prior=new Uint8Array(await stored.data.arrayBuffer());if(prior.byteLength!==bytes.byteLength||createHash("sha256").update(prior).digest("hex")!==hash)return reply({error:"A different original already occupies this source identity. It was not overwritten."},409);}
  const registered=await svc.rpc("register_fuel_source",{p_actor:auth.user!.id,p_client:clientId,p_id:id,p_name:name,p_sha256:hash,p_bytes:bytes.byteLength});
  if(registered.error||!validSourceReceipt(registered.data,id,clientId,hash,bytes.byteLength))return reply({error:"Original bytes may be stored privately, but registration is unconfirmed. Retry this exact file; no plan or measurement was created."},503);
  return reply(registered.data);
 }catch{return reply({error:"Source save is unconfirmed. Retry the preserved original file."},503);}
}
