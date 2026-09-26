import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {parseRequestPayload,parseRequestReceipt} from "@/lib/booking/client-contract";
import {sendEmail,emailShell} from "@/lib/mailer";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return reply({error:"Unauthorized",saved:false},401);
  if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin.",saved:false},403);
  let body;
  try{body=parseRequestPayload(await smallJson(request,4096));}catch(e){return reply({error:e instanceof Error?e.message:"Invalid request.",saved:false},400);}
  // One transaction rechecks the class schedule, 1:1 commitments, trainer blocks,
  // request limit and active identity. class_occurrences is checked inside that command.
  const {data,error}=await db.rpc("request_client_training_session",{p_id:body.request_id,p_when:body.scheduled_at,p_note:body.note});
  if(error){
    const status=error.code==="42501"?403:error.code==="22023"?400:error.code==="P0100"?429:["23514","23505","23P01","40P01","40001","55P03"].includes(error.code)?409:503;
    const message=status===503?"Request service is unavailable. Your request was not confirmed; retry with the same reference.":["23505","23P01","40P01","40001","55P03"].includes(error.code)?"The calendar changed while saving. Refresh availability and try again.":error.message;
    const rollbackKnown=["42501","22023","P0100","23514","23505","23P01","40P01","40001","55P03","42883","42P01","42703","P0001","PGRST202"].includes(error.code);
    return reply({error:message,...(rollbackKnown?{saved:false}:{})},status);
  }
  let receipt;
  try{receipt=parseRequestReceipt(data,body.request_id);}catch{return reply({error:"Request receipt was invalid. Retry this same request before changing it."},503);}
  let notification="not_confirmed";
  if(!receipt.deduped&&process.env.OWNER_EMAIL){
    try{
      const when=new Date(body.scheduled_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
      const sent=await sendEmail({to:process.env.OWNER_EMAIL,idempotencyKey:"session-request/"+receipt.id,subject:"New IMS training request",html:emailShell({heading:"New session request",bodyHtml:"<p>A client requested training for <strong>"+when+"</strong>.</p><p>Review the request in Coach OS Action Center. This is not a confirmed booking.</p>"})});
      notification=sent.ok?"provider_accepted":"not_confirmed";
    }catch{/* Request is saved independently of email; never claim delivery. */}
  }
  return reply({...receipt,notification},receipt.deduped?200:201);
}
