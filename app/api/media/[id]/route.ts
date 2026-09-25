import {type NextRequest,NextResponse} from "next/server";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {mayAccessMedia,confirmedMediaAction} from "@/lib/media/feedback";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid media"},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const profile=await db.from("profiles").select("id,role,deleted_at").eq("id",user.id).maybeSingle();
 if(profile.error)return reply({error:"Account lookup unavailable"},503);
 if(!profile.data||profile.data.deleted_at||!["owner","trainer","client"].includes(profile.data.role))return reply({error:"Account unavailable"},403);
 const mediaQ=await db.from("client_media").select("id,client_id,storage_path,poster_path,title,kind,exercise_id,archived_at").eq("id",id).maybeSingle();
 if(mediaQ.error)return reply({error:"Coaching media unavailable"},503);
 const media=mediaQ.data;if(!media||media.archived_at)return reply({error:"Not found"},404);
 const client=await db.from("clients").select("id,primary_trainer_id").eq("id",media.client_id).maybeSingle();
 if(client.error)return reply({error:"Client assignment unavailable"},503);
 if(!client.data||!mayAccessMedia(profile.data,media.client_id,client.data.primary_trainer_id))return reply({error:"Not found"},404);
 // The privileged signer is reached only after active-account and exact-client authorization.
 const svc=createServiceClient();
 if(media.exercise_id&&profile.data.role==="client"){
  const [exercise,review]=await Promise.all([db.from("exercises").select("client_visible").eq("id",media.exercise_id).maybeSingle(),svc.from("exercise_reviews").select("safety_status").eq("exercise_id",media.exercise_id).maybeSingle()]);
  if(exercise.error||review.error)return reply({error:"Demonstration eligibility unavailable"},503);
  if(!exercise.data?.client_visible||review.data?.safety_status!=="approved")return reply({error:"Demonstration unavailable"},404);
 }
 const ownedPath=(path:string|null)=>!!path&&path.startsWith(media.client_id+"/")&&!path.includes("..")&&!path.includes("\\");
 if(!ownedPath(media.storage_path))return reply({error:"No verified uploaded file is attached to this record"},409);
 const signed=await svc.storage.from("client-media").createSignedUrl(media.storage_path!,300);
 if(signed.error||!signed.data?.signedUrl)return reply({error:"Playback could not be prepared"},503);
 let poster:string|null=null;
 if(ownedPath(media.poster_path)){const result=await svc.storage.from("client-media").createSignedUrl(media.poster_path!,300);poster=result.data?.signedUrl??null;}
 // Preparing a URL is not evidence that the client watched the video. GET has no write side effects.
 return reply({url:signed.data.signedUrl,poster,title:media.title});
}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid media"},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const {data,error}=await db.rpc("archive_client_media",{p_media_id:id});
 if(error){const status=error.code==="42501"?403:error.code==="P0002"?404:503;return reply({error:status===503?"Archive was not confirmed. Your coaching record has not been reported as removed.":error.message},status);}
 try{return reply(confirmedMediaAction(data,id,"archive"));}catch{return reply({error:"Archive receipt was invalid. Refresh to check the record."},503);}
}
