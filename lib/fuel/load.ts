import {notFound,redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {FUEL_UUID,fuelDate,shiftDate,latestJournal,type PlanVersion,type Release,type Journal,type Review,type BodyComp} from "./model";
export async function fuelAccess(clientId:string) {
 if(!FUEL_UUID.test(clientId))notFound();const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw Error("Fuel authorization unavailable.");if(!me.data||me.data.deleted_at||!["owner","trainer","client"].includes(me.data.role))redirect("/dashboard");
 const client=await db.from("clients").select("id,primary_trainer_id").eq("id",clientId).maybeSingle();
 if(client.error)throw Error("Client assignment unavailable.");
 if(!client.data||(me.data.role==="client"?user.id!==clientId:me.data.role!=="owner"&&client.data.primary_trainer_id!==user.id))notFound();
 const person=await db.from("profiles").select("id,full_name,role,deleted_at").eq("id",clientId).maybeSingle();
 if(person.error)throw Error("Client identity unavailable.");if(!person.data||person.data.role!=="client"||person.data.deleted_at)notFound();
 return {db,user,role:me.data.role,person:person.data,staff:me.data.role!=="client"};
}
export type FuelData={versions:PlanVersion[];releases:Release[];journal:Journal[];reviews:Review[];body:BodyComp[];sessions:{id:string;scheduled_at:string;status:string;session_type:string}[];asOf:string;from:string};
export async function loadFuel(db:Awaited<ReturnType<typeof createClient>>,clientId:string):Promise<FuelData> {
 const asOf=fuelDate(),from=shiftDate(asOf,-27);
 const [versions,releases,journal,reviews,body,sessions]=await Promise.all([
  readCompleteEvidence<PlanVersion>((a,b)=>db.from("fuel_plan_versions").select("id,client_id,revision,content,origin,source_reference,created_at",{count:"exact"}).eq("client_id",clientId).order("id").range(a,b)),
  readCompleteEvidence<Release>((a,b)=>db.from("fuel_plan_releases").select("id,client_id,version_id,sequence,reason,created_at",{count:"exact"}).eq("client_id",clientId).order("id").range(a,b)),
  readCompleteEvidence<Journal>((a,b)=>db.from("fuel_journal_entries").select("id,client_id,kind,entry_date,revision,payload,plan_version_id,created_at",{count:"exact"}).eq("client_id",clientId).gte("entry_date",from).lte("entry_date",asOf).order("id").range(a,b)),
  readCompleteEvidence<Review>((a,b)=>db.from("fuel_coach_reviews").select("id,client_id,entry_id,note,disposition,created_at",{count:"exact"}).eq("client_id",clientId).order("id").range(a,b)),
  readCompleteEvidence<BodyComp>((a,b)=>db.from("body_comp_records").select("id,recorded_at,weight_lb,body_fat_pct,lean_mass_lb,method",{count:"exact"}).eq("client_id",clientId).order("id").range(a,b)),
  readCompleteEvidence<{id:string;scheduled_at:string;status:string;session_type:string}>((a,b)=>db.from("sessions").select("id,scheduled_at,status,session_type",{count:"exact"}).eq("client_id",clientId).gte("scheduled_at",shiftDate(asOf,-1)+"T00:00:00Z").lt("scheduled_at",shiftDate(asOf,2)+"T00:00:00Z").order("id").range(a,b)),
 ]);
 return {versions:versions.sort((a,b)=>b.revision-a.revision),releases:releases.sort((a,b)=>b.sequence-a.sequence),journal:latestJournal(journal),reviews,body:body.sort((a,b)=>a.recorded_at.localeCompare(b.recorded_at)),sessions,asOf,from};
}
