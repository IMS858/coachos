import {type NextRequest} from "next/server";
import {authorizeStaffMediaClient,mediaReply} from "@/lib/media/staff-client";
import {smallJson} from "@/lib/media/request";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {sendEmail,emailShell} from "@/lib/mailer";
export const dynamic="force-dynamic";
/** Explicit approved demonstration assignment. This never publishes a program prescription. */
export async function POST(request:NextRequest){
 const raw=await smallJson(request,16000).catch(()=>null);if(!raw||typeof raw!=="object"||Array.isArray(raw))return mediaReply({error:"Invalid demonstration request"},400);
 const body=raw as Record<string,unknown>,clientId=body.client_id,exerciseIds=body.exercise_ids,note=body.note??"",category=body.category??"mobility";
 if(Object.keys(body).some(k=>!["client_id","exercise_ids","note","category"].includes(k))||typeof clientId!=="string"||!CAPTURE_UUID.test(clientId)||!Array.isArray(exerciseIds)||exerciseIds.length<1||exerciseIds.length>30||exerciseIds.some(id=>typeof id!=="string"||!CAPTURE_UUID.test(id))||typeof note!=="string"||note.length>2000||typeof category!=="string"||!["mobility","strength","conditioning","general"].includes(category))return mediaReply({error:"Pick 1–30 valid exercises and a coaching note under 2,000 characters."},400);
 const auth=await authorizeStaffMediaClient(request,clientId);if(auth.error)return auth.error;
 const ids=[...new Set(exerciseIds as string[])];
 // The command rechecks client_visible, safety_status='approved' and playable video under locks.
 const {data,error}=await auth.db!.rpc("assign_client_media_demos",{p_client_id:clientId,p_exercise_ids:ids,p_category:category,p_note:note.trim()||null});
 if(error){const status=error.code==="42501"?403:["22023","40001","40P01"].includes(error.code)?409:503;return mediaReply({error:status===503?"Demonstration assignment could not be confirmed. Retry the same selection.":error.message},status);}
 const receipt=data as {ok?:boolean;client_id?:string;added?:number;skipped?:number;media_ids?:unknown[]}|null;
 const added=receipt?.added,skipped=receipt?.skipped,mediaIds=receipt?.media_ids;
 if(!receipt||receipt.ok!==true||receipt.client_id!==clientId||typeof added!=="number"||typeof skipped!=="number"||!Number.isInteger(added)||!Number.isInteger(skipped)||added<0||skipped<0||added+skipped!==ids.length||!Array.isArray(mediaIds)||mediaIds.length!==added||mediaIds.some(id=>typeof id!=="string"||!CAPTURE_UUID.test(id)))return mediaReply({error:"Assignment receipt was invalid. Check the client record before retrying."},503);
 let notified=false;
 if(added>0&&auth.recipient!.email){try{
  const site=process.env.NEXT_PUBLIC_SITE_URL||"https://coachos-opal.vercel.app",escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const sent=await sendEmail({to:auth.recipient!.email,idempotencyKey:"demo-assignment/"+mediaIds[0],subject:"Your IMS coach shared exercise demonstrations",html:emailShell({heading:"New demonstrations in My Plan",bodyHtml:'<p>Your coach shared '+added+' approved demonstration'+(added===1?'':'s')+'.</p><p><a href="'+escape(site+'/plan')+'">Open My Plan</a></p>'})});notified=sent.ok;
 }catch{/* Saving demonstration assignments does not guarantee notification delivery. */}}
 return mediaReply({ok:true,added,skipped,notified,message:added===0?"Already assigned; previous notes remain unchanged.":"Approved demonstrations assigned."});
}
