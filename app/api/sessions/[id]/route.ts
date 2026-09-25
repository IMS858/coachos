import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
 if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session"},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return reply({error:"Authorization unavailable"},503);if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const raw=await smallJson(request,16000).catch(()=>null);if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"Invalid session update"},400);
 const body=raw as Record<string,unknown>,allowed:Record<string,unknown>={};
 if(Object.keys(body).some(k=>!["notes_pre","notes_post","scheduled_at","duration_minutes","service_type"].includes(k)))return reply({error:"Unsupported session fields"},400);
 for(const key of ["notes_pre","notes_post"]){if(body[key]!==undefined){if(body[key]!==null&&(typeof body[key]!=="string"||(body[key] as string).length>4000))return reply({error:"Session notes must be text under 4,000 characters"},400);allowed[key]=body[key];}}
 if(body.scheduled_at!==undefined){if(typeof body.scheduled_at!=="string"||!Number.isFinite(Date.parse(body.scheduled_at)))return reply({error:"Valid date required"},400);allowed.scheduled_at=body.scheduled_at;}
 if(body.duration_minutes!==undefined){if(typeof body.duration_minutes!=="number"||!Number.isInteger(body.duration_minutes)||body.duration_minutes<1||body.duration_minutes>480)return reply({error:"Valid session duration required"},400);allowed.duration_minutes=body.duration_minutes;}
 if(body.service_type!==undefined){if(body.service_type!=="training")return reply({error:"This workflow is training only"},400);allowed.service_type="training";}
 if(!Object.keys(allowed).length)return reply({error:"No valid fields"},400);
 const session=await db.from("sessions").select("id,client_id,trainer_id,status").eq("id",id).maybeSingle();if(session.error)return reply({error:"Session lookup unavailable"},503);if(!session.data)return reply({error:"Session not found"},404);
 const client=await db.from("clients").select("primary_trainer_id").eq("id",session.data.client_id).maybeSingle();if(client.error)return reply({error:"Assignment unavailable"},503);
 if(!client.data||(me.data.role!=="owner"&&session.data.trainer_id!==user.id&&client.data.primary_trainer_id!==user.id))return reply({error:"Session access denied"},403);
 const saved=await db.from("sessions").update(allowed).eq("id",id).select("id").maybeSingle();
 if(saved.error)return reply({error:["23P01","40P01"].includes(saved.error.code)?"Schedule conflict. Refresh before retrying.":"Update was not confirmed."},["23P01","40P01"].includes(saved.error.code)?409:503);
 return saved.data?reply({ok:true,id:saved.data.id}):reply({error:"Session update was not confirmed."},409);
}
