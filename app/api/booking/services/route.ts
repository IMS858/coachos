import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data,error}=await supabase.from("service_catalog").select("id,slug,name,description,category,duration_minutes,session_type,minimum_notice_minutes,booking_horizon_days,booking_buffer_before_minutes,booking_buffer_after_minutes").eq("active",true).eq("client_bookable",true).not("duration_minutes","is",null).order("display_order");
 if(error){if(error.code==="42703")return NextResponse.json({services:[],legacy:true},{headers:{"Cache-Control":"private, no-store"}});return NextResponse.json({error:"Service catalog unavailable"},{status:503});}
 return NextResponse.json({services:data??[],legacy:false},{headers:{"Cache-Control":"private, no-store"}});
}
