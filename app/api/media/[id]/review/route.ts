import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
import {parseFeedback,confirmedMediaAction} from "@/lib/media/feedback";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid media"},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 let feedback:string;try{feedback=parseFeedback(await smallJson(request,10000));}catch{return reply({error:"Feedback must be 2–2,000 characters."},400);}
 // The RPC checks active staff and assigned-client scope, and commits feedback + audit together.
 const {data,error}=await db.rpc("finalize_client_media_review",{p_media_id:id,p_feedback:feedback});
 if(error){const status=error.code==="42501"?403:error.code==="P0002"?404:["22023","40001","40P01"].includes(error.code)?409:503;
 return reply({error:status===503?"Feedback could not be confirmed. Keep your draft and retry; review may need configuration.":status===403?"Only the assigned coach or owner may review this clip.":error.message},status);}
 try{return reply(confirmedMediaAction(data,id,"review"));}catch{return reply({error:"Feedback receipt was invalid. Keep your draft and check the coaching record before retrying."},503);}
}
