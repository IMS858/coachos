import {type NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {CAPTURE_UUID} from "@/lib/exercises/capture";
import {smallJson} from "@/lib/media/request";
import {parseSessionNotes,sameSessionNotes,type SessionNotes} from "@/lib/coaching/session-close";
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
 if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session"},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)return reply({error:"Authorization unavailable"},503);if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 if(request.headers.get("origin")!==request.nextUrl.origin)return reply({error:"Invalid request origin"},403);
 const raw=await smallJson(request,32000).catch(()=>null);if(!raw||typeof raw!=="object"||Array.isArray(raw))return reply({error:"Invalid session update"},400);
 const body=raw as Record<string,unknown>;
 const allowed:{notes_pre?:string|null;notes_post?:string|null;scheduled_at?:string;duration_minutes?:number;service_type?:"training"}={};
 if(Object.keys(body).some(k=>!["notes_pre","notes_post","scheduled_at","duration_minutes","service_type","expected_notes"].includes(k)))return reply({error:"Unsupported session fields"},400);
 let expected:SessionNotes|null=null;
 if(Object.hasOwn(body,"expected_notes")){
  try{expected=parseSessionNotes(body.expected_notes);parseSessionNotes({notes_pre:body.notes_pre,notes_post:body.notes_post});}catch{return reply({error:"Both original and edited session notes are required."},400);}
  if(["scheduled_at","duration_minutes","service_type"].some(k=>Object.hasOwn(body,k)))return reply({error:"Save notes separately from schedule changes."},400);
 }
 for(const key of ["notes_pre","notes_post"] as const){const value=body[key];if(value!==undefined){if(value!==null&&(typeof value!=="string"||value.length>4000))return reply({error:"Session notes must be text under 4,000 characters"},400);allowed[key]=value as string|null;}}
 if(body.scheduled_at!==undefined){if(typeof body.scheduled_at!=="string"||!Number.isFinite(Date.parse(body.scheduled_at)))return reply({error:"Valid date required"},400);allowed.scheduled_at=body.scheduled_at;}
 if(body.duration_minutes!==undefined){if(typeof body.duration_minutes!=="number"||!Number.isInteger(body.duration_minutes)||body.duration_minutes<1||body.duration_minutes>480)return reply({error:"Valid session duration required"},400);allowed.duration_minutes=body.duration_minutes;}
 if(body.service_type!==undefined){if(body.service_type!=="training")return reply({error:"This workflow is training only"},400);allowed.service_type="training";}
 if(!Object.keys(allowed).length)return reply({error:"No valid fields"},400);
 const session=await db.from("sessions").select("id,client_id,trainer_id,status,notes_pre,notes_post").eq("id",id).maybeSingle();if(session.error)return reply({error:"Session lookup unavailable"},503);if(!session.data)return reply({error:"Session not found"},404);
 const client=await db.from("clients").select("primary_trainer_id").eq("id",session.data.client_id).maybeSingle();if(client.error)return reply({error:"Assignment unavailable"},503);
 if(!client.data||(me.data.role!=="owner"&&session.data.trainer_id!==user.id&&client.data.primary_trainer_id!==user.id))return reply({error:"Session access denied"},403);
 const requested=expected?parseSessionNotes({notes_pre:allowed.notes_pre,notes_post:allowed.notes_post}):null;
 if(expected&&!sameSessionNotes(expected,session.data)){
  return requested&&sameSessionNotes(requested,session.data)?reply({ok:true,id,deduped:true}):reply({error:"Session notes changed in another tab. Your edits are still here; copy them before refreshing to reconcile."},409);
 }
 if(expected&&session.data.status==="completed"&&allowed.notes_pre!==session.data.notes_pre)return reply({error:"Pre-session notes are locked after completion."},409);
 let update=db.from("sessions").update(allowed).eq("id",id).eq("status",session.data.status);
 if(expected){for(const key of ["notes_pre","notes_post"] as const){update=expected[key]===null?update.is(key,null):update.eq(key,expected[key]!);}}
 const saved=await update.select("id").maybeSingle();
 if(saved.error)return reply({error:["23P01","40P01"].includes(saved.error.code)?"Schedule conflict. Refresh before retrying.":"Update was not confirmed."},["23P01","40P01"].includes(saved.error.code)?409:503);
 if(saved.data)return reply({ok:true,id:saved.data.id});
 if(requested){const retry=await db.from("sessions").select("notes_pre,notes_post").eq("id",id).maybeSingle();if(!retry.error&&retry.data&&sameSessionNotes(requested,retry.data))return reply({ok:true,id,deduped:true});}
 return reply({error:"Session changed while saving. Your edits are still here; refresh only after preserving them."},409);
}
