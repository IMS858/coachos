import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IMS_MOBILE } from "@/lib/mobile/app-contract";
export async function GET(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({authenticated:false},{status:401,headers:{"Cache-Control":"private, no-store"}});
 const {data:profile,error}=await supabase.from("profiles").select("id,full_name,email,role,deleted_at").eq("id",user.id).maybeSingle();
 if(error)return NextResponse.json({error:"Account lookup unavailable"},{status:503});
 if(!profile||profile.deleted_at||profile.role!=="client")return NextResponse.json({error:"Client account required"},{status:403});
 return NextResponse.json({authenticated:true,app:IMS_MOBILE.appName,user:{id:profile.id,full_name:profile.full_name,email:profile.email,role:profile.role},routes:IMS_MOBILE.clientRoutes},{headers:{"Cache-Control":"private, no-store"}});
}
