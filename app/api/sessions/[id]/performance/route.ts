import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {sessionPlanRows} from "@/lib/coaching/session-execution";
import {recordAudit} from "@/lib/audit";
import {smallJson} from "@/lib/media/request";

const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function actuals(value:Record<string,unknown>){
 const integer=(key:string,min:number,max:number)=>{const v=value[key];if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${key} is outside the supported range.`);return n;};
 const rpeValue=value.rpe_actual;let rpe:number|null=null;if(rpeValue!==null&&rpeValue!==undefined&&rpeValue!==""){rpe=Number(rpeValue);if(!Number.isFinite(rpe)||rpe<1||rpe>10)throw new Error("RPE must be 1–10.");}
 const text=(key:string,max:number)=>{const v=value[key];if(v===undefined||v===null)return "";if(typeof v!=="string"||v.length>max)throw new Error(`${key} is too long.`);return v.trim();};
 return {sets_completed:integer("sets_completed",0,30),reps_completed:text("reps_completed",80),load_performed:text("load_performed",160),rpe_actual:rpe,coach_note:text("coach_note",1000)};
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session."},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return reply({error:"Authorization unavailable"},503);if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 const origin=request.headers.get("origin");if(origin&&origin!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 let body:Record<string,unknown>;try{body=await smallJson(request,12000) as Record<string,unknown>;}catch{return reply({error:"Invalid performance record."},400);}
 if(!body||Array.isArray(body)||Object.keys(body).some(k=>!["request_id","prescription_key","expected_updated_at","sets_completed","reps_completed","load_performed","rpe_actual","coach_note"].includes(k)))return reply({error:"Invalid performance fields."},400);
 const requestId=typeof body.request_id==="string"&&CAPTURE_UUID.test(body.request_id)?body.request_id:null,prescriptionKey=typeof body.prescription_key==="string"?body.prescription_key:"";
 if(!requestId||!prescriptionKey||prescriptionKey.length>180)return reply({error:"Valid exercise save reference required."},400);
 let performed;try{performed=actuals(body);}catch(e){return reply({error:e instanceof Error?e.message:"Invalid performance values."},400);}
 const session=await db.from("sessions").select("id,client_id,trainer_id,program_id,status").eq("id",id).maybeSingle();
 if(session.error)return reply({error:"Session lookup unavailable."},503);if(!session.data)return reply({error:"Session not found."},404);
 if(["cancelled","late_cancelled","no_show"].includes(session.data.status))return reply({error:"Cancelled or missed sessions cannot receive performed-exercise records."},409);
 if(!session.data.program_id)return reply({error:"Link this session to a program before recording exercise performance."},409);
 const [program,assignments]=await Promise.all([
  db.from("programs").select("id,client_id,data").eq("id",session.data.program_id).maybeSingle(),
  db.from("program_exercises").select("id,exercise_id,block,position,sets,reps,load_prescription,rest_seconds,tempo,notes,exercises(name,ims_label)").eq("program_id",session.data.program_id),
 ]);
 if(program.error||assignments.error)return reply({error:"Program prescription evidence is unavailable."},503);
 if(!program.data||program.data.client_id!==session.data.client_id)return reply({error:"Session program does not match this client."},409);
 const planned=sessionPlanRows(program.data.data,assignments.data??[]),row=planned.find(item=>item.key===prescriptionKey);
 if(!row)return reply({error:"This exercise is no longer part of the linked program. Refresh the session."},409);
 const prior=await db.from("session_exercise_performance").select("id,session_id,prescription_key,updated_at,sets_completed,reps_completed,load_performed,rpe_actual,coach_note").eq("session_id",id).eq("prescription_key",prescriptionKey).maybeSingle();
 if(prior.error)return reply({error:"Performance history could not be checked."},503);
 if(prior.data){
   if(prior.data.id!==requestId)return reply({error:"This exercise already has a performance record. Refresh before editing."},409);
   if(typeof body.expected_updated_at!=="string"||prior.data.updated_at!==body.expected_updated_at)return reply({error:"This exercise result changed elsewhere. Refresh before saving."},409);
   const saved=await db.from("session_exercise_performance").update(performed).eq("id",requestId).eq("updated_at",body.expected_updated_at).select("id,updated_at").maybeSingle();
   if(saved.error)return reply({error:"Exercise performance was not confirmed saved."},503);if(!saved.data)return reply({error:"Another edit won this save. Refresh the session."},409);
   await recordAudit({actorId:user.id,action:"session.exercise_performance.updated",entityType:"session",entityId:id,changes:{performance_id:requestId,prescription_key:prescriptionKey}});
   return reply({ok:true,id:saved.data.id,updated_at:saved.data.updated_at,deduped:false});
 }
 if(body.expected_updated_at!=null)return reply({error:"This exercise result no longer exists. Refresh the session."},409);
 const snapshot={...row.prescription,block:row.block};
 const saved=await db.from("session_exercise_performance").insert({id:requestId,session_id:id,client_id:session.data.client_id,program_id:session.data.program_id,prescription_key:row.key,exercise_id:row.exercise_id,exercise_name:row.name,prescription_snapshot:snapshot,...performed,recorded_by:user.id}).select("id,updated_at").single();
 if(saved.error?.code==="23505")return reply({error:"This exercise was saved in another tab. Refresh before editing."},409);
 if(saved.error||!saved.data)return reply({error:"Exercise performance was not confirmed saved."},503);
 await recordAudit({actorId:user.id,action:"session.exercise_performance.created",entityType:"session",entityId:id,changes:{performance_id:requestId,prescription_key:prescriptionKey}});
 return reply({ok:true,id:saved.data.id,updated_at:saved.data.updated_at,deduped:false},201);
}
