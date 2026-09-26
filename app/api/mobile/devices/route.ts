import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
export async function POST(request:NextRequest){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:profile,error:profileError}=await supabase.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(profileError)return NextResponse.json({error:"Account lookup unavailable"},{status:503});
 if(!profile||profile.deleted_at||profile.role!=="client")return NextResponse.json({error:"Client account required"},{status:403});
 const body=await request.json().catch(()=>({}));const token=typeof body.push_token==="string"?body.push_token.trim():"";
 if(token.length<20||token.length>4096)return NextResponse.json({error:"Valid push token required"},{status:400});
 const appVersion=typeof body.app_version==="string"?body.app_version.slice(0,50):null;const deviceLabel=typeof body.device_label==="string"?body.device_label.slice(0,100):null;
 const svc=createServiceClient();const {error}=await svc.from("mobile_devices").upsert({user_id:user.id,platform:"ios",push_token:token,app_version:appVersion,device_label:deviceLabel,enabled:true,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"push_token"});
 if(error)return NextResponse.json({error:"Device registration unavailable"},{status:503});
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
}
export async function DELETE(request:NextRequest){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>({}));const token=typeof body.push_token==="string"?body.push_token.trim():"";if(!token)return NextResponse.json({error:"Push token required"},{status:400});
 const svc=createServiceClient();const {error}=await svc.from("mobile_devices").update({enabled:false,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("push_token",token);
 if(error)return NextResponse.json({error:"Device update unavailable"},{status:503});return NextResponse.json({ok:true});
}
