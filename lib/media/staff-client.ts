import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
export const mediaReply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
/** Call before creating a service client or issuing any upload capability. */
export async function authorizeStaffMediaClient(request:NextRequest,clientId:unknown){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return {error:mediaReply({error:"Unauthorized"},401)};
 if(request.headers.get("origin")!==request.nextUrl.origin)return {error:mediaReply({error:"Invalid request origin"},403)};
 const me=await db.from("profiles").select("id,role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)return {error:mediaReply({error:"Staff authorization unavailable"},503)};
 if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return {error:mediaReply({error:"Active staff account required"},403)};
 if(typeof clientId!=="string"||!CAPTURE_UUID.test(clientId))return {error:mediaReply({error:"Valid client required"},400)};
 const client=await db.from("clients").select("id,primary_trainer_id").eq("id",clientId).maybeSingle();
 if(client.error)return {error:mediaReply({error:"Client assignment unavailable"},503)};
 if(!client.data||(me.data.role!=="owner"&&client.data.primary_trainer_id!==user.id))return {error:mediaReply({error:"Only the assigned coach or owner may manage this client's media"},403)};
 const recipient=await db.from("profiles").select("id,full_name,email,role,deleted_at").eq("id",clientId).maybeSingle();
 if(recipient.error)return {error:mediaReply({error:"Client account unavailable"},503)};
 if(!recipient.data||recipient.data.role!=="client"||recipient.data.deleted_at)return {error:mediaReply({error:"Active client account required"},403)};
 return {db,user,client:client.data,recipient:recipient.data};
}
