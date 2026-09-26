import {type NextRequest} from "next/server";
import {createServiceClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {authorizeStaffMediaClient,mediaReply} from "@/lib/media/staff-client";
import {parseStaffMediaSave,COACH_MEDIA_MIME} from "@/lib/media/staff-upload";
import {sendEmail,emailShell} from "@/lib/mailer";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 let input;try{input=parseStaffMediaSave(await smallJson(request,16000));}catch(cause){return mediaReply({error:cause instanceof Error?cause.message:"Invalid media details"},400);}
 const auth=await authorizeStaffMediaClient(request,input.client_id);if(auth.error)return auth.error;
 const svc=createServiceClient();
 const columns="id,client_id,uploaded_by,title,note,kind,category,storage_path,poster_path,duration_seconds,archived_at,notified_at";
 const lookup=()=>svc.from("client_media").select(columns).eq("client_id",input.client_id).eq("storage_path",input.storage_path).maybeSingle();
 const same=(row:Record<string,unknown>)=>!row.archived_at&&row.uploaded_by===auth.user!.id&&['client_id','title','note','kind','category','storage_path','poster_path','duration_seconds'].every(key=>(row[key]??null)===(input[key as keyof typeof input]??null));
 const previous=await lookup();if(previous.error)return mediaReply({error:"Upload-save lookup unavailable. Retry this same file."},503);
 if(previous.data)return same(previous.data)?mediaReply({ok:true,id:previous.data.id,notified:!!previous.data.notified_at,deduped:true}):mediaReply({error:"This file already has a different coaching record. Reopen it instead of creating a duplicate."},409);
 const name=input.storage_path.slice(input.client_id.length+1);
 const list=await svc.storage.from("client-media").list(input.client_id,{search:name,limit:2});
 if(list.error)return mediaReply({error:"Uploaded file verification unavailable. Retry without uploading another copy."},503);
 const file=list.data?.find(row=>row.name===name&&row.id);
 if(!file||file.metadata?.mimetype!==COACH_MEDIA_MIME[input.ext]||!(Number(file.metadata?.size)>0)||Number(file.metadata?.size)>200*1024*1024)return mediaReply({error:"The complete coaching file could not be verified. Use a supported file under 200 MB."},409);
 const {ext:ignoredExtension,...record}=input;void ignoredExtension;
 const saved=await svc.from("client_media").insert({...record,uploaded_by:auth.user!.id}).select("id").single();
 if(saved.error?.code==="23505"){const repeated=await lookup();if(!repeated.error&&repeated.data&&same(repeated.data))return mediaReply({ok:true,id:repeated.data.id,notified:!!repeated.data.notified_at,deduped:true});}
 if(saved.error||!saved.data)return mediaReply({error:"Media save was not confirmed. Keep this file reference and retry."},503);
 let notified=false;
 try{const email=auth.recipient!.email;if(email){const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const site=process.env.NEXT_PUBLIC_SITE_URL||"https://coachos-opal.vercel.app";
 const result=await sendEmail({to:email,idempotencyKey:"coach-media/"+saved.data.id,subject:"New coaching media from IMS",html:emailShell({heading:"Your coach shared a demonstration",bodyHtml:'<p>Your IMS coach shared <strong>'+escape(input.title)+'</strong>.</p>'+(input.note?'<p>'+escape(input.note)+'</p>':'')+'<p><a href="'+escape(site+'/plan')+'">Open My Plan</a></p>'})});notified=result.ok;
 if(notified)await svc.from("client_media").update({notified_at:new Date().toISOString()}).eq("id",saved.data.id);
 }}catch{/* Persisted coaching record and notification delivery are separate outcomes. */}
 return mediaReply({ok:true,id:saved.data.id,notified,deduped:false},201);
}
