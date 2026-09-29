import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CLIENT_USAGE_EVENTS, CLIENT_USAGE_SURFACES } from "@/lib/usage/client-event";

export const dynamic = "force-dynamic";
const schema=z.object({request_id:z.string().uuid(),event:z.enum(CLIENT_USAGE_EVENTS),surface:z.enum(CLIENT_USAGE_SURFACES)}).strict();
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});

/** Records one privacy-minimized usage event for the signed-in client only. */
export async function POST(request:NextRequest){
 if(request.headers.get("origin")&&request.headers.get("origin")!==request.nextUrl.origin)return reply({ok:true,recorded:false});
 try{
  const raw=await request.text();if(raw.length>2048)return reply({ok:false,recorded:false},413);
  const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return reply({ok:false,recorded:false},400);
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({ok:true,recorded:false});
  const profile=await db.from("profiles").select("role,deleted_at,contact_only").eq("id",user.id).maybeSingle();
  if(profile.error||!profile.data||profile.data.role!=="client"||profile.data.deleted_at||profile.data.contact_only)return reply({ok:true,recorded:false});
  const c=parsed.data;const result=await db.rpc("record_client_app_event",{p_request:c.request_id,p_event:c.event,p_surface:c.surface});
  if(result.error){console.warn("[client-usage] event not recorded");return reply({ok:true,recorded:false});}
  const receipt=result.data as Record<string,unknown>|null;
  if(!receipt||receipt.ok!==true||receipt.request_id!==c.request_id||typeof receipt.recorded!=="boolean")return reply({ok:true,recorded:false});
  return reply({ok:true,recorded:receipt.recorded,deduped:receipt.deduped===true});
 }catch{return reply({ok:true,recorded:false});}
}
