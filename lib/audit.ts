import {createServiceClient} from "@/lib/supabase/server";

type AuditInput={actorId:string;action:string;entityType:string;entityId:string;changes?:Record<string,unknown>};
export async function recordAudit(input:AuditInput){
 try{
  const svc=createServiceClient();
  const safeChanges=input.changes?Object.fromEntries(Object.entries(input.changes).filter(([,v])=>v!==undefined)):null;
  const {error}=await svc.from("audit_logs").insert({actor_id:input.actorId,action:input.action,entity_type:input.entityType,entity_id:input.entityId,changes:safeChanges});
  if(error)console.warn("[audit] write failed",input.action,error.message);
 }catch(error){console.warn("[audit] write exception",input.action,error instanceof Error?error.message:String(error));}
}
