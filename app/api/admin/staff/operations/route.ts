import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
const allowed=new Set(["active","onboarding","leave","inactive"]);
export async function POST(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner"||me.data.deleted_at)return NextResponse.json({error:"Owner only"},{status:403});
 if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
 const body=await request.json().catch(()=>null),staffId=String(body?.staff_id??""),status=String(body?.staff_status??""),operationalOwner=String(body?.operational_owner??"").trim().slice(0,120);
 const responsibilities=Array.isArray(body?.responsibilities)?body.responsibilities.map((v:unknown)=>String(v).trim()).filter(Boolean).slice(0,12):[];
 if(!/^[0-9a-f-]{36}$/i.test(staffId)||!allowed.has(status))return NextResponse.json({error:"Valid staff member and status required"},{status:400});
 const staff=await db.from("profiles").select("id,role,deleted_at").eq("id",staffId).maybeSingle();if(staff.error||!staff.data||staff.data.deleted_at||!["owner","trainer"].includes(staff.data.role))return NextResponse.json({error:"Active IMS staff member required"},{status:400});
 const result=await db.from("staff_operations").upsert({staff_id:staffId,staff_status:status,operational_owner:operationalOwner||null,responsibilities,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"staff_id"});if(result.error)return NextResponse.json({error:"Could not save staff operations"},{status:503});
 const audit=await db.from("audit_logs").insert({actor_id:user.id,action:"staff.operations.updated",entity_type:"profile",entity_id:staffId,changes:{staff_status:status,operational_owner:operationalOwner||null,responsibilities}});if(audit.error)return NextResponse.json({error:"Staff state saved but audit record failed; verify operational history"},{status:503});
 return NextResponse.json({ok:true});
}
