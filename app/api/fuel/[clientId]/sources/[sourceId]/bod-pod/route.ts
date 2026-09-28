import {NextResponse} from "next/server";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {FUEL_UUID} from "@/lib/fuel/model";
import {parseImsBodPodPdf} from "@/lib/fuel/bod-pod-pdf";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export async function GET(_request:Request,{params}:{params:Promise<{clientId:string;sourceId:string}>}){
 const {clientId,sourceId}=await params;if(!FUEL_UUID.test(clientId)||!FUEL_UUID.test(sourceId))return reply({error:"Invalid source identity."},400);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Sign in required."},401);
 const allowed=await db.rpc("fuel_can_access",{p_client:clientId,p_staff_only:true});if(allowed.error)return reply({error:"Source authorization unavailable."},503);if(allowed.data!==true)return reply({error:"Assigned coach or owner required."},403);
 const row=await db.from("fuel_source_documents").select("id,client_id,original_name,storage_path,sha256,byte_size").eq("id",sourceId).eq("client_id",clientId).maybeSingle();if(row.error)return reply({error:"Source registry unavailable."},503);if(!row.data)return reply({error:"Source not found."},404);
 const file=await createServiceClient().storage.from("fuel-sources").download(row.data.storage_path);if(file.error||!file.data)return reply({error:"Private source bytes unavailable."},503);
 const bytes=new Uint8Array(await file.data.arrayBuffer());if(bytes.byteLength!==row.data.byte_size)return reply({error:"Private source size does not match its registry receipt."},409);
 const extraction=parseImsBodPodPdf(bytes);
 return reply({source:{id:row.data.id,name:row.data.original_name,sha256:row.data.sha256,byte_size:row.data.byte_size},extraction});
}
