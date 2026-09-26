import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { growthCommandSchema } from "@/lib/growth/commands";
export const dynamic = "force-dynamic";
const reply = (body: Record<string,unknown>, status=200) => NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function readCommand(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Missing body");
  const reader=request.body.getReader(), chunks:Uint8Array[]=[]; let bytes=0;
  try { for (;;) { const next=await reader.read(); if(next.done)break; bytes+=next.value.length; if(bytes>32768){await reader.cancel();throw new Error("Too large");} chunks.push(next.value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/** Internal records only: this route cannot charge, execute paid research, send outreach or create a client. */
export async function POST(request: Request) {
  const db=await createClient(); const {data:{user}}=await db.auth.getUser();
  if(!user)return reply({error:"Sign in to manage growth."},401);
  const profile=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(profile.error)return reply({error:"Authorization is unavailable. Nothing was saved."},503);
  if(profile.data?.role!=="owner" || profile.data.deleted_at)return reply({error:"Active owner access required."},403);
  if(request.headers.get("origin")!==new URL(request.url).origin)return reply({error:"Invalid request origin."},403);
  let raw:unknown; try {raw=await readCommand(request);}catch{return reply({error:"Use a valid growth record under 32 KB."},400);}
  const parsed=growthCommandSchema.safeParse(raw);
  if(!parsed.success)return reply({error:parsed.error.issues[0]?.message??"Invalid growth record."},400);
  const command=parsed.data, today=new Date().toISOString().slice(0,10);
  if(command.action==="review_opportunity" && command.decision==="approve" && (!command.due_on || command.next_action.length<5))return reply({error:"Approval needs a next action and follow-up date. It does not create a lead."},400);
  if(command.action==="record_spend" && command.incurred_on>today)return reply({error:"Record incurred spend, not a future or estimated charge."},400);
  if(command.action==="link_inquiry" && ((command.client_id===null)!==(command.revenue_from===null) || (command.revenue_from && command.revenue_from>today)))return reply({error:"Client mapping needs a real attribution start date, not a future date."},400);
  const result=await db.rpc("execute_growth_command",{p_command:command});
  if(result.error){
    const code=result.error.code;
    if(code==="42501")return reply({error:"Active owner access required."},403);
    if(code==="40001" || code==="23505")return reply({error:"This record changed or is already linked. Reload before retrying; no duplicate record was created."},409);
    if(["22023","22P02","22007","22008","23514","23502","23503"].includes(code))return reply({error:"The source, date, amount or link did not pass validation. Check the record and retry."},400);
    return reply({error:"Growth save was not confirmed. Keep this form open and retry the same save."},503);
  }
  if(!result.data?.ok || !result.data.id || typeof result.data.updated_at!=="string" || !Number.isFinite(Date.parse(result.data.updated_at)))return reply({error:"Save confirmation was incomplete. Retry the same save."},503);
  return reply(result.data);
}
