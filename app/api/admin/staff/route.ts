import {type NextRequest,NextResponse} from "next/server";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {sendLoginInvite} from "@/lib/invite";

export async function POST(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner"||me.data.deleted_at)return NextResponse.json({error:"Owner only"},{status:403});
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 const body=await request.json().catch(()=>null);const fullName=String(body?.full_name??"").trim(),email=String(body?.email??"").trim().toLowerCase(),phone=String(body?.phone??"").trim();
 if(fullName.length<2||fullName.length>120)return NextResponse.json({error:"Enter the trainer's full name"},{status:400});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Enter a valid email"},{status:400});
 const svc=createServiceClient();const existing=await svc.from("profiles").select("id,role").eq("email",email).maybeSingle();if(existing.error)return NextResponse.json({error:"Could not check existing staff"},{status:503});if(existing.data)return NextResponse.json({error:"An IMS account already uses this email"},{status:409});
 const tempPassword=Array.from(crypto.getRandomValues(new Uint8Array(20))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const created=await svc.auth.admin.createUser({email,password:tempPassword,email_confirm:true,user_metadata:{full_name:fullName}});if(created.error||!created.data.user)return NextResponse.json({error:"Could not create trainer account"},{status:500});
 const trainerId=created.data.user.id;const updated=await svc.from("profiles").update({full_name:fullName,phone:phone||null,role:"trainer"}).eq("id",trainerId).select("id,full_name,email,role").single();
 if(updated.error){await svc.auth.admin.deleteUser(trainerId);return NextResponse.json({error:"Could not assign trainer role"},{status:500});}
 await svc.from("audit_logs").insert({actor_id:user.id,action:"staff.invited",entity_type:"profile",entity_id:trainerId,changes:{role:"trainer",email}});
 const invite=await sendLoginInvite(email,fullName);
 return NextResponse.json({ok:true,trainer:updated.data,invite_sent:invite.sent,invite_link:invite.link,invite_error:invite.error});
}
