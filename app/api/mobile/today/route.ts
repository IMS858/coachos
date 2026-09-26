import { NextResponse } from "next/server";import { createClient,createServiceClient } from "@/lib/supabase/server";
export async function GET(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const svc=createServiceClient();const {data:client,error:clientError}=await svc.from("clients").select("id,primary_trainer_id,status").eq("id",user.id).maybeSingle();if(clientError)return NextResponse.json({error:"Client lookup unavailable"},{status:503});if(!client||client.status!=="active")return NextResponse.json({error:"Active client required"},{status:403});
 const now=new Date().toISOString();const [{data:sessions,error:sessionError},{data:plans,error:planError},{data:programs,error:programError}]=await Promise.all([
  svc.from("sessions").select("id,scheduled_at,duration_minutes,status").eq("client_id",user.id).in("status",["requested","scheduled","confirmed"]).gte("scheduled_at",now).order("scheduled_at").limit(3),
  svc.from("plans").select("id,kind,tier,custom_label,total_sessions,sessions_used,expires_at,status").eq("client_id",user.id).eq("status","active").limit(5),
  svc.from("programs").select("id,name,status,updated_at,data").eq("client_id",user.id).in("status",["active","published"]).order("updated_at",{ascending:false}).limit(3)
 ]);if(sessionError||planError||programError)return NextResponse.json({error:"Today data unavailable"},{status:503});
 const packages=(plans??[]).filter((p:any)=>p.kind==="package").map((p:any)=>({...p,sessions_remaining:p.total_sessions==null?null:Math.max(0,Number(p.total_sessions)-Number(p.sessions_used??0))}));
 return NextResponse.json({client_id:user.id,trainer_id:client.primary_trainer_id,upcoming_sessions:sessions??[],packages,programs:(programs??[]).map((p:any)=>({id:p.id,name:p.name,status:p.status,updated_at:p.updated_at,review_status:p.data?.review_status??null}))},{headers:{"Cache-Control":"private, no-store"}});
}
