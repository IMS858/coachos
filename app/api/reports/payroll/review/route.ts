import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

async function ownerDb(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return {error:NextResponse.json({error:"Unauthorized"},{status:401})};
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error||me.data?.role!=="owner"||me.data.deleted_at)return {error:NextResponse.json({error:"Owner access required"},{status:403})};
 if(request.method!=="GET"&&request.headers.get("origin")!==request.nextUrl.origin)return {error:NextResponse.json({error:"Invalid request origin"},{status:403})};
 return {db,user};
}
export async function POST(request:NextRequest){
 const auth=await ownerDb(request);if("error" in auth)return auth.error;
 const body=await request.json().catch(()=>null),sessionId=String(body?.session_id??""),reviewed=body?.reviewed===true;
 if(!/^[0-9a-f-]{36}$/i.test(sessionId))return NextResponse.json({error:"Valid session required"},{status:400});
 if(reviewed){const result=await auth.db.from("payroll_evidence_reviews").upsert({session_id:sessionId,reviewed_by:auth.user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"session_id"});if(result.error)return NextResponse.json({error:"Could not save payroll review"},{status:503});}
 else {const result=await auth.db.from("payroll_evidence_reviews").delete().eq("session_id",sessionId);if(result.error)return NextResponse.json({error:"Could not remove payroll review"},{status:503});}
 return NextResponse.json({ok:true,reviewed});
}
