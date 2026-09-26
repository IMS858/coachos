import {redirect} from "next/navigation";
import Link from "next/link";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {ClassBookingList,type ClassCatalogRow} from "@/components/classes/class-booking-list";
import {ClientClassAccess} from "@/components/classes/client-class-access";
import {ClientClassParticipation} from "@/components/classes/client-class-participation";
export const dynamic="force-dynamic";
export default async function ClassesPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/classes");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)throw new Error("Account lookup unavailable.");if(!me.data||me.data.deleted_at)redirect("/login");if(me.data.role!=="client")redirect("/classes/manage");
 const occurrences=await db.from("class_occurrences").select("id,starts_at,ends_at,location,capacity,trainer_id,template_id").gte("starts_at",new Date().toISOString()).eq("status","scheduled").order("starts_at").limit(41);
 const values=occurrences.data??[],ids=values.map(c=>c.id),trainerIds=[...new Set(values.map(c=>c.trainer_id))],templateIds=[...new Set(values.map(c=>c.template_id))];
 const [enrollmentQ,trainerQ,templateQ]=await Promise.all([
  ids.length?db.from("class_enrollments").select("id,occurrence_id,status").eq("client_id",user.id).in("occurrence_id",ids):Promise.resolve({data:[],error:null}),
  trainerIds.length?db.from("profiles").select("id,full_name").in("id",trainerIds):Promise.resolve({data:[],error:null}),
  templateIds.length?db.from("class_templates").select("id,name,description,category").eq("visibility","published").in("id",templateIds):Promise.resolve({data:[],error:null}),
 ]);
 const failed=!!(occurrences.error||enrollmentQ.error||trainerQ.error||templateQ.error);
 const enrollment=new Map((enrollmentQ.data??[]).map(e=>[e.occurrence_id,e])),names=new Map((trainerQ.data??[]).map(t=>[t.id,t.full_name])),templates=new Map((templateQ.data??[]).map(t=>[t.id,t]));
 // Client-scoped enrollment RLS cannot answer total occupancy. Never derive remaining seats from it.
 const rows:ClassCatalogRow[]=values.slice(0,40).filter(c=>templates.has(c.template_id)).map(c=>({id:c.id,name:templates.get(c.template_id)!.name,description:templates.get(c.template_id)!.description,category:templates.get(c.template_id)!.category,starts_at:c.starts_at,ends_at:c.ends_at,location:c.location,capacity:c.capacity,trainer:names.get(c.trainer_id)??"Coach name unavailable",enrollment_id:enrollment.get(c.id)?.id??null,enrollment_status:enrollment.get(c.id)?.status??null}));
 return <AppShell><div className="mx-auto w-full max-w-2xl space-y-5 pb-12"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS group coaching / Prelaunch</p><h1 className="mt-2 text-4xl font-bold">Classes</h1><p className="mt-3 text-sm leading-6 text-white/75">Group coaching, class access and participation history—separate from your private training.</p></header>
 {failed?<p role="alert" className="rounded-2xl border border-status-limited/30 bg-white p-5 text-sm text-status-limited">Class sources are unavailable or their rollout is pending. No empty schedule or available-seat count was assumed.</p>:<><ClassBookingList rows={rows}/>{values.length>40&&<p className="text-xs text-cream-faint">The first 40 future dates are shown; more records exist.</p>}</>}
 <ClientClassAccess/><ClientClassParticipation/><Link href="/book" className="inline-flex min-h-12 items-center text-sm font-semibold text-sky">Book private training →</Link></div></AppShell>;
}
