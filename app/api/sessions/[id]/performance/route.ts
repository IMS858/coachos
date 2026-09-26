import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CAPTURE_UUID } from "@/lib/exercises/capture";
import { parsePrescription } from "@/lib/exercises/prescription";
import { parsePerformedValues } from "@/lib/coaching/session-execution";
import { smallJson } from "@/lib/media/request";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!CAPTURE_UUID.test(id))return reply({error:"Invalid session."},400);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return reply({error:"Unauthorized"},401);
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)return reply({error:"Authorization unavailable"},503);
 if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return reply({error:"Staff only"},403);
 if(request.headers.get("origin")!==request.nextUrl.origin||request.headers.get("sec-fetch-site")==="cross-site")return reply({error:"Invalid request origin"},403);
 try{
  const raw=await smallJson(request,16000);
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid result.");
  const b=raw as Record<string,unknown>;
  const allowed=["request_id","prescription_key","expected_updated_at","expected_program_updated_at","expected_prescription","actual"];
  if(allowed.some(k=>!Object.hasOwn(b,k))||Object.keys(b).some(k=>!allowed.includes(k)))throw new Error("Invalid performance fields.");
  if(typeof b.request_id!=="string"||!CAPTURE_UUID.test(b.request_id)||typeof b.prescription_key!=="string"||!b.prescription_key||b.prescription_key.length>180)throw new Error("Valid exercise reference required.");
  const stamp=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
  if(!stamp(b.expected_program_updated_at)||(b.expected_updated_at!==null&&!stamp(b.expected_updated_at)))throw new Error("Reopen the session before saving.");
  const actual=parsePerformedValues(b.actual),prescription=parsePrescription(b.expected_prescription);
  // save_session_performance owns the prescription_snapshot and atomic audit/history transaction.
  const {data,error}=await db.rpc("save_session_performance",{p_session_id:id,p_record_id:b.request_id,p_key:b.prescription_key,p_expected_updated_at:b.expected_updated_at,p_expected_program_updated_at:b.expected_program_updated_at,p_expected_prescription:prescription,p_actual:actual});
  if(error){const code=error.code;const status=code==="42501"?403:code==="P0002"?404:["40001","23505","40P01"].includes(code)?409:["22023","22P02","22003"].includes(code)?400:503;return reply({error:status===503?"Save was not confirmed. Your inputs are still here; retry the same result.":status===403?"You cannot record this session.":status===409?"The session, program or result changed. Refresh before editing.":status===404?"Session not found.":"Check the actual values and session eligibility, then refresh the prescription."},status);}
  if(!data?.ok||!data.id||!data.updated_at)return reply({error:"Save was not confirmed. Keep this page open and retry."},503);
  return reply(data);
 }catch(cause){return reply({error:cause instanceof Error?cause.message:"Invalid performed result."},400);}
}
