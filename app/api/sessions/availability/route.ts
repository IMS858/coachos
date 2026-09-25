import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const TZ="America/Los_Angeles";
function wallClockToUtc(ymd:string,time:string):Date|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ymd)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  const naive=Date.parse(`${ymd}T${time}:00Z`);
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  for(const offset of [7,8]){const d=new Date(naive+offset*3600000);const p=Object.fromEntries(fmt.formatToParts(d).map(x=>[x.type,x.value]));if(`${p.year}-${p.month}-${p.day}`===ymd&&`${p.hour}:${p.minute}`===time)return d;}
  return null;
}
function slots(date:string){
 const [y,m,d]=date.split("-").map(Number);const day=new Date(Date.UTC(y,(m??1)-1,d??1,12)).getUTCDay();if(day===0)return[];
 const [open,close]=day===6?[8,13]:[6,19];const out:string[]=[];for(let h=open;h<=close-1;h++)for(const min of [0,30])out.push(`${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`);return out;
}
export async function GET(request:NextRequest){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const date=request.nextUrl.searchParams.get("date")??"";
 const serviceId=request.nextUrl.searchParams.get("service_id");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:"Valid date required"},{status:400});
 const svc=createServiceClient();
 let duration=60,bufferBefore=0,bufferAfter=0;
 if(serviceId){const {data:service,error:serviceError}=await svc.from("service_catalog").select("id,duration_minutes,client_bookable,booking_buffer_before_minutes,booking_buffer_after_minutes").eq("id",serviceId).eq("active",true).maybeSingle();if(serviceError)return NextResponse.json({error:"Service lookup unavailable"},{status:503});if(!service?.client_bookable||!service.duration_minutes)return NextResponse.json({error:"Service is not available for client booking"},{status:409});duration=service.duration_minutes;bufferBefore=service.booking_buffer_before_minutes??0;bufferAfter=service.booking_buffer_after_minutes??0;}
 const {data:client,error:clientError}=await svc.from("clients").select("primary_trainer_id").eq("id",user.id).maybeSingle();
 if(clientError)return NextResponse.json({error:"Client lookup unavailable"},{status:503});if(!client?.primary_trainer_id)return NextResponse.json({error:"Primary coach required"},{status:409});
 const rawCandidates=slots(date).map(time=>({time,when:wallClockToUtc(date,time)})).filter(x=>x.when) as {time:string;when:Date}[];
 const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
 const {data:rules,error:ruleError}=await svc.from("trainer_availability_rules").select("start_time,end_time").eq("trainer_id",client.primary_trainer_id).eq("weekday",weekday).eq("active",true);
 if(ruleError && ruleError.code!=="42P01")return NextResponse.json({error:"Coach availability rules unavailable"},{status:503});
 const withinRules=(time:string)=>!rules?.length||rules.some((r:any)=>time>=String(r.start_time).slice(0,5)&&time<String(r.end_time).slice(0,5));
 const candidates=rawCandidates.filter(c=>withinRules(c.time));
 if(!candidates.length)return NextResponse.json({date,trainer_id:client.primary_trainer_id,slots:[]});
 const start=candidates[0].when;const end=new Date(candidates[candidates.length-1].when.getTime()+60*60000);
 const {data:blocks,error:blockError}=await svc.from("trainer_time_blocks").select("starts_at,ends_at").eq("trainer_id",client.primary_trainer_id).lt("starts_at",end.toISOString()).gt("ends_at",start.toISOString());
 if(blockError && blockError.code!=="42P01")return NextResponse.json({error:"Coach blocked-time lookup unavailable"},{status:503});
 const [{data:busy,error},{data:classes,error:classError}]=await Promise.all([svc.from("sessions").select("scheduled_at,duration_minutes,status").eq("trainer_id",client.primary_trainer_id).in("status",["requested","scheduled","confirmed"]).gte("scheduled_at",start.toISOString()).lt("scheduled_at",end.toISOString()),svc.from("class_occurrences").select("starts_at,ends_at,status").eq("trainer_id",client.primary_trainer_id).neq("status","cancelled").gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString())]);
 if(error||classError)return NextResponse.json({error:"Availability lookup unavailable"},{status:503});
 const available=candidates.filter(c=>{const cs=c.when.getTime()-bufferBefore*60000,ce=c.when.getTime()+(duration+bufferAfter)*60000;const sessionConflict=(busy??[]).some((b:any)=>{const bs=new Date(b.scheduled_at).getTime(),be=bs+(b.duration_minutes??60)*60000;return bs<ce&&be>cs;});const classConflict=(classes??[]).some((b:any)=>new Date(b.starts_at).getTime()<ce&&new Date(b.ends_at).getTime()>cs);const blocked=(blocks??[]).some((b:any)=>new Date(b.starts_at).getTime()<ce&&new Date(b.ends_at).getTime()>cs);return !sessionConflict&&!classConflict&&!blocked;}).map(c=>c.time);
 return NextResponse.json({date,trainer_id:client.primary_trainer_id,duration_minutes:duration,slots:available},{headers:{"Cache-Control":"private, no-store"}});
}
