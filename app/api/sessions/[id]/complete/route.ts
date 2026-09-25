import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
import {requireConfirmedAction} from "@/lib/coaching/session-close";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function complete(request:NextRequest,id:string,value:boolean){
 if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session"},400);
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const body=value?await smallJson(request,2048).catch(()=>null):{};
 if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>k!=="service_type"))return reply({error:"Invalid completion request"},400);
 const service=(body as Record<string,unknown>).service_type;
 if(service!==undefined&&service!==null&&service!=="training")return reply({error:"This completion workflow is training only"},400);
 const {data,error}=await supabase.rpc('set_session_completion',{p_session_id:id,p_complete:value,p_service_type:service===undefined?null:service});
 if(error){
  if(error.code==="PGRST202"||error.code==="42883")return reply({error:"Session completion is not configured in this environment. Saved results and notes remain saved; completion and package usage were not confirmed.",code:"COMPLETION_UNAVAILABLE"},503);
  const status=error.code==="42501"?403:error.code==="P0002"?404:["22023","23P01","40P01","40001"].includes(error.code)?409:503;
  return reply({error:status===503?"Completion was not confirmed. Check the session before retrying.":error.message},status);
 }
 try{return reply(requireConfirmedAction(data));}catch{return reply({error:"Completion receipt was invalid. Check the session before retrying."},503);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){return complete(request,(await params).id,true);}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){return complete(request,(await params).id,false);}
