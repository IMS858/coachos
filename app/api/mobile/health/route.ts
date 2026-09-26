import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function realDate(value:unknown):value is string{if(typeof value!=="string"||!DATE.test(value))return false;const d=new Date(value+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export async function POST(request:NextRequest){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const declared=Number(request.headers.get("content-length")??0);if(Number.isFinite(declared)&&declared>12000)return NextResponse.json({error:"Health summary is too large"},{status:413});
 const raw=await request.text().catch(()=>"");if(new TextEncoder().encode(raw).length>12000)return NextResponse.json({error:"Health summary is too large"},{status:413});
 let body:unknown;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid health summary"},{status:400});}
 if(!body||typeof body!=="object"||Array.isArray(body)||!realDate((body as Record<string,unknown>).day))return NextResponse.json({error:"Invalid health summary"},{status:400});
 const {day,...payload}=body as Record<string,unknown>;
 const {data,error}=await db.rpc("sync_client_health_day",{p_day:day,p_payload:payload});
 if(error){const invalid=["22023","22007"].includes(error.code);return NextResponse.json({error:invalid?"Health summary was not accepted. No values were inferred.":"Health sync unavailable. Existing evidence was not changed."},{status:invalid?400:503});}
 return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}


export async function DELETE(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data,error}=await db.rpc("clear_my_client_health_data");
 if(error)return NextResponse.json({error:"Health data could not be cleared. Existing evidence was not reported as deleted."},{status:503});
 return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
}
