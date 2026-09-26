import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {FUEL_UUID} from "@/lib/fuel/model";
import {parseFuelCommand,validFuelReceipt} from "@/lib/fuel/validation";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest,{params}:{params:Promise<{clientId:string}>}) {
 const {clientId}=await params;if(!FUEL_UUID.test(clientId))return reply({error:"Invalid client identity."},400);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin."},403);
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Sign in to use Fuel & Performance."},401);
 const profile=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(profile.error)return reply({error:"Fuel authorization unavailable."},503);
 if(!profile.data||profile.data.deleted_at||!["owner","trainer","client"].includes(profile.data.role))return reply({error:"Active account required."},403);
 const subject=await db.from("clients").select("id,primary_trainer_id").eq("id",clientId).maybeSingle();
 if(subject.error)return reply({error:"Client authorization unavailable."},503);
 if(!subject.data||(profile.data.role==="client"?user.id!==clientId:profile.data.role!=="owner"&&subject.data.primary_trainer_id!==user.id))return reply({error:"Fuel access denied."},403);
 let command;try{command=parseFuelCommand(await smallJson(request,100000));}catch(cause){return reply({error:cause instanceof Error?cause.message:"Invalid fuel request."},400);}
 const clientAction=["save_daily","save_checkin"].includes(command.action);
 if(clientAction!==(profile.data.role==="client"))return reply({error:clientAction?"Client check-ins must be client-reported.":"Assigned coach review required."},403);
 try{
  const result=await db.rpc("execute_fuel_command",{p_client_id:clientId,p_command:command});
  if(result.error){const code=result.error.code;
   if(code==="42501")return reply({error:"Fuel permission was not confirmed."},403);
   if(code==="P0002")return reply({error:"The requested fuel record was not found."},404);
   if(["40001","23505"].includes(code))return reply({error:"This record changed or was already reviewed. Refresh before making a new decision."},409);
   if(["22023","22P02","22007","22008","23514"].includes(code))return reply({error:"Fuel input could not be validated. Check date, quantities, source, and confirmation."},400);
   return reply({error:"Fuel save is unconfirmed. Retry the same request. Database rollout may be required."},503);
  }
  if(!validFuelReceipt(result.data,command,clientId))return reply({error:"Incomplete save receipt. Retry the same request before editing."},503);
  return reply(result.data);
 }catch{return reply({error:"Connection interrupted. Retry the preserved request; saving is not confirmed."},503);}
}
