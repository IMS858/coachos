import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export async function POST(request:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);if(!body||typeof body!=="object"||Array.isArray(body)||!DATE.test(String(body.day??"")))return NextResponse.json({error:"Invalid health summary"},{status:400});
 const {day,...payload}=body as Record<string,unknown>;
 const {data,error}=await db.rpc("sync_client_health_day",{p_day:day,p_payload:payload});
 if(error){const invalid=error.code==="22023";return NextResponse.json({error:invalid?"Health summary was not accepted. No values were inferred.":"Health sync unavailable. Existing evidence was not changed."},{status:invalid?400:503});}
 return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
