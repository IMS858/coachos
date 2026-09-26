import {type NextRequest,NextResponse} from "next/server";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {recordAudit} from "@/lib/audit";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!UUID.test(id))return NextResponse.json({error:"Invalid contact"},{status:400});
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:me,error:meError}=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(meError||!me||me.deleted_at||!["owner","trainer"].includes(me.role))return NextResponse.json({error:"Staff only"},{status:403});
 const body=await request.json().catch(()=>({}));if(body.send_invite!==false)return NextResponse.json({error:"Client conversion does not send login invitations. Invite separately from the client profile."},{status:400});
 const trainerId=String(body.trainer_id??"");if(!UUID.test(trainerId))return NextResponse.json({error:"Choose a primary coach"},{status:400});
 const svc=createServiceClient(),{data:lead,error:leadError}=await svc.from("leads").select("id,full_name,email,phone,stage,source,notes").eq("id",id).maybeSingle();
 if(leadError)return NextResponse.json({error:"Contact could not be loaded"},{status:500});if(!lead)return NextResponse.json({error:"Contact not found"},{status:404});
 const {data:prior,error:priorError}=await svc.from("lead_client_conversions").select("client_id").eq("lead_id",id).maybeSingle();
 if(priorError)return NextResponse.json({error:"Conversion receipt could not be checked. Nothing was created."},{status:503});
 if(prior?.client_id)return NextResponse.json({error:"This contact is already a Coach OS client.",client_id:prior.client_id},{status:409});
 if(lead.stage==="converted")return NextResponse.json({error:"This historical contact is marked converted but has no verified conversion receipt. Review before creating another account."},{status:409});
 const email=String(body.email??lead.email??"").trim().toLowerCase();if(!EMAIL.test(email))return NextResponse.json({error:"A valid email is required before adding a client."},{status:400});
 const {data:coach,error:coachError}=await svc.from("profiles").select("id,role,deleted_at").eq("id",trainerId).maybeSingle();
 if(coachError||!coach||coach.deleted_at||!["owner","trainer"].includes(coach.role))return NextResponse.json({error:"Choose an active IMS coach."},{status:400});
 const {data:existing,error:existingError}=await svc.from("profiles").select("id,role").ilike("email",email).is("deleted_at",null);
 if(existingError)return NextResponse.json({error:"Duplicate client check failed. Nothing was created."},{status:500});
 if((existing??[]).length)return NextResponse.json({error:"An active Coach OS identity already uses this email. Review that profile before converting."},{status:409});
 const password=Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("");
 const {data:auth,error:authError}=await svc.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:lead.full_name}});
 if(authError||!auth.user)return NextResponse.json({error:"Could not create the client account."},{status:500});
 const clientId=auth.user.id;
 let claimed=false;
 try{
  const {error:claimError}=await svc.from("lead_client_conversions").insert({lead_id:id,client_id:clientId,converted_by:user.id});if(claimError)throw new Error(claimError.code==="23505"?"CONTACT_ALREADY_CONVERTED":"CONVERSION_CLAIM_FAILED");claimed=true;
  const {error:profileError}=await svc.from("profiles").update({full_name:lead.full_name,phone:lead.phone||null,role:"client"}).eq("id",clientId);if(profileError)throw profileError;
  const {error:clientError}=await svc.from("clients").insert({id:clientId,status:"active",billing_type:"unset",joined_at:new Date().toISOString(),primary_trainer_id:trainerId});if(clientError)throw clientError;
  const {error:leadUpdateError}=await svc.from("leads").update({stage:"converted",updated_at:new Date().toISOString()}).eq("id",id).neq("stage","converted");if(leadUpdateError)throw leadUpdateError;
 }catch(cause){
  await svc.from("clients").delete().eq("id",clientId);if(claimed)await svc.from("lead_client_conversions").delete().eq("lead_id",id).eq("client_id",clientId);await svc.auth.admin.deleteUser(clientId);
  if(cause instanceof Error&&cause.message==="CONTACT_ALREADY_CONVERTED")return NextResponse.json({error:"This contact was converted by another request. No duplicate client was kept."},{status:409});
  return NextResponse.json({error:"Client conversion could not be completed. The new account and conversion claim were rolled back; retry after checking the contact."},{status:500});
 }
 await recordAudit({actorId:user.id,action:"lead.converted_to_client",entityType:"client",entityId:clientId,changes:{lead_id:id,primary_trainer_id:trainerId,invite_sent:false,package_inferred:false,balance_inferred:false,appointment_inferred:false}});
 return NextResponse.json({ok:true,client_id:clientId,invite_sent:false});
}
