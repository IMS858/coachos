import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const raw=await smallJson(request,16000).catch(()=>null);if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"Invalid session request"},400);
 const body=raw as Record<string,unknown>,keys=["request_id","mode","client_id","trainer_id","scheduled_at","duration_minutes","session_type","service_type","notes_pre","notes_post"];
 if(Object.keys(body).some(k=>!keys.includes(k)))return reply({error:"Unsupported session fields"},400);
 if(typeof body.request_id!=="string"||!CAPTURE_UUID.test(body.request_id)||typeof body.client_id!=="string"||!CAPTURE_UUID.test(body.client_id)||typeof body.trainer_id!=="string"||!CAPTURE_UUID.test(body.trainer_id))return reply({error:"Valid session, client and trainer IDs are required"},400);
 if(body.mode!=="schedule"&&body.mode!=="log")return reply({error:"Invalid session mode"},400);
 if(body.session_type!=="training"&&body.session_type!=="assessment")return reply({error:"Coach OS session creation supports training and assessment only"},400);
 if((body.session_type==="training"&&body.service_type!=="training")||(body.session_type==="assessment"&&body.service_type!==null))return reply({error:"Service does not match session type"},400);
 if(typeof body.scheduled_at!=="string"||!Number.isFinite(Date.parse(body.scheduled_at))||typeof body.duration_minutes!=="number"||!Number.isInteger(body.duration_minutes)||body.duration_minutes<1||body.duration_minutes>480)return reply({error:"Invalid session details"},400);
 for(const k of ["notes_pre","notes_post"]){const v=body[k];if(v!==undefined&&v!==null&&(typeof v!=="string"||v.length>4000))return reply({error:"Session notes must be text under 4,000 characters"},400);}
 const {data,error}=await db.rpc("create_staff_session",{p_id:body.request_id,p_body:body});
 if(error?.code==="PGRST202"||error?.code==="42883")return reply({error:"Session creation is not configured in this environment.",code:"SESSION_CREATE_UNAVAILABLE"},503);
 if(error){const status=error.code==="42501"?403:["22023","23P01","40P01","40001"].includes(error.code)?409:503;return reply({error:status===503?"Session save was not confirmed. Retry with the same request.":error.code==="23P01"?"Trainer already has a session at this time.":error.message},status);}
 if(!data||data.ok!==true||typeof data.session_id!=="string")return reply({error:"Session save receipt was invalid. Check the schedule before retrying."},503);
 return reply(data);
}
