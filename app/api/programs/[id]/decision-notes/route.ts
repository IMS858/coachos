import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
const CATEGORIES=new Set(["progression","regression","technique","assessment","tolerance","schedule","other"]);
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid program."},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return reply({error:"Authorization unavailable"},503);if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body))return reply({error:"Invalid decision note"},400);
 const v=body as Record<string,unknown>,requestId=typeof v.request_id==="string"&&CAPTURE_UUID.test(v.request_id)?v.request_id:null,category=typeof v.category==="string"?v.category:"",note=typeof v.note==="string"?v.note.trim():"";
 if(!requestId||!CATEGORIES.has(category)||note.length<10||note.length>2000||Object.keys(v).some(k=>!["request_id","category","note"].includes(k)))return reply({error:"Choose a category and enter a 10–2,000 character coaching reason."},400);
 const program=await db.from("programs").select("id,client_id").eq("id",id).maybeSingle();if(program.error)return reply({error:"Program lookup unavailable"},503);if(!program.data)return reply({error:"Program not found"},404);
 const existing=await db.from("program_decision_notes").select("id,program_id,client_id,actor_id,category,note").eq("id",requestId).maybeSingle();if(existing.error)return reply({error:"Decision history could not be checked"},503);
 if(existing.data){const same=existing.data.program_id===id&&existing.data.client_id===program.data.client_id&&existing.data.actor_id===user.id&&existing.data.category===category&&existing.data.note===note;return same?reply({ok:true,id:requestId,deduped:true}):reply({error:"This save reference is already in use."},409);}
 const saved=await db.from("program_decision_notes").insert({id:requestId,program_id:id,client_id:program.data.client_id,actor_id:user.id,category,note}).select("id,created_at").single();
 if(saved.error||!saved.data)return reply({error:"Decision note was not confirmed saved."},503);
 return reply({ok:true,id:saved.data.id,created_at:saved.data.created_at,deduped:false},201);
}
