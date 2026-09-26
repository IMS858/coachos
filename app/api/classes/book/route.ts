import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
const reply=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function prelaunch(request:NextRequest){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Sign in required."},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)return reply({error:"Authorization unavailable."},503);
 if(!me.data||me.data.deleted_at||me.data.role!=="client")return reply({error:"Active client account required."},403);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin."},403);
 // book_class and cancel_class_booking are also revoked for authenticated callers in 0057.
 // Do not re-enable these prototype commands by changing a UI flag alone.
 return reply({error:"Class registration is in prelaunch. No booking, cancellation or waitlist promotion was made. Contact IMS to review existing records.",code:"CLASS_PRELAUNCH"},409);
}
export const POST=prelaunch;
export const DELETE=prelaunch;
