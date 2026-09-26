import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {parseAvailabilityReceipt,validBookingDate} from "@/lib/booking/client-contract";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return reply({error:"Unauthorized"},401);
  const date=request.nextUrl.searchParams.get("date")??"";
  if(!validBookingDate(date)||[...request.nextUrl.searchParams.keys()].some(k=>k!=="date"))return reply({error:"Choose a valid date. This picker is for 60-minute training requests."},400);
  // The scoped database command checks sessions, class_occurrences and trainer blocks.
  // Missing policy data is an error, never an empty or fully available calendar.
  const {data,error}=await db.rpc("get_my_training_availability",{p_date:date});
  if(error){
    const status=error.code==="42501"?403:error.code==="22023"?400:error.code==="23514"?409:503;
    return reply({error:status===503?"Coach availability is unavailable. No times have been assumed open.":error.message},status);
  }
  try{return reply(parseAvailabilityReceipt(data,date));}catch{return reply({error:"Availability could not be verified. Please retry."},503);}
}
