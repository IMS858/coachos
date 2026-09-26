import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {smallJson} from "@/lib/media/request";
import {parseAccountDetails} from "@/lib/account/profile-contract";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function PATCH(request:NextRequest){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return reply({error:"Unauthorized"},401);
  if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin."},403);
  let details;
  try{details=parseAccountDetails(await smallJson(request,2048));}catch(e){return reply({error:e instanceof Error?e.message:"Unsupported account fields."},400);}
  const {data:me,error:profileError}=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(profileError)return reply({error:"Account authorization unavailable."},503);
  if(!me||me.deleted_at||me.role !== "client")return reply({error:"Client account required."},403);
  const {data:saved,error}=await db.from("profiles").update(details).eq("id",user.id).eq("role","client").is("deleted_at",null).select("id,full_name,phone").maybeSingle();
  if(error||!saved||saved.id!==user.id||saved.full_name!==details.full_name||saved.phone!==details.phone)return reply({error:"Account changes were not confirmed. Your edits are still here; retry before leaving."},503);
  return reply({ok:true,profile:{full_name:saved.full_name,phone:saved.phone}});
}
