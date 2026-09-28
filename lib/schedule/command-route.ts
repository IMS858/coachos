import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {parseBookingEnvelope,validBookingReceipt} from "./commands";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function bookingCommandRoute(request:NextRequest){
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 let envelope;try{envelope=parseBookingEnvelope(await smallJson(request,16000));}catch(error){return reply({error:error instanceof Error?error.message:"Invalid booking request"},400);}
 const {data,error}=await db.rpc("execute_booking_command",{p_request_id:envelope.request_id,p_command:envelope.command});
 if(error){const status=error.code==='42501'?403:error.code==='P0002'?404:['22023','22P02','22007','23P01','40P01','40001'].includes(error.code)?409:503;
  return reply({error:status===503?"Booking save is unconfirmed. Retry the same request; do not create another booking.":error.message},status);}
 if(!validBookingReceipt(data,envelope))return reply({error:"Booking receipt is incomplete. Retry the preserved request."},503);
 return reply(data);
}
