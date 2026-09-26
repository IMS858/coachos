import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session."},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return reply({error:"Authorization unavailable"},503);if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const raw=await smallJson(request,4096).catch(()=>null);if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"Invalid program selection"},400);
 const b=raw as Record<string,unknown>;
 if(typeof b.program_id!=="string"||!CAPTURE_UUID.test(b.program_id)||!(b.expected_program_id===null||typeof b.expected_program_id==="string"&&CAPTURE_UUID.test(b.expected_program_id))||Object.keys(b).some(k=>!["program_id","expected_program_id"].includes(k)))return reply({error:"Choose a valid client program"},400);
 const {data,error}=await db.rpc("link_session_training_program",{p_session_id:id,p_program_id:b.program_id,p_expected_program_id:b.expected_program_id});
 if(error)return reply({error:error.code==="42501"?"Session access denied.":["40001","22023"].includes(error.code)?"The session or program is not eligible, or performed evidence already exists. Refresh to review.":"Program link was not confirmed."},error.code==="42501"?403:["40001","22023"].includes(error.code)?409:503);
 return data?.ok?reply(data):reply({error:"Program link was not confirmed."},503);
}
