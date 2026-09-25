import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {SessionDetail} from "@/components/sessions/session-detail";
import {SessionCoachPrep} from "@/components/sessions/session-coach-prep";
import {SessionLastDebrief} from "@/components/sessions/session-last-debrief";
import {SessionTrainingExecution} from "@/components/sessions/session-training-execution";
import {SessionWorkspace} from "@/components/sessions/session-workspace";
export const dynamic="force-dynamic";
export default async function SessionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Session authorization unavailable.");if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))redirect("/dashboard");
 const result=await db.from("sessions").select("id,scheduled_at,duration_minutes,session_type,service_type,status,notes_pre,notes_post,completed_at,plan_id,client_id,trainer_id").eq("id",id).maybeSingle();
 if(result.error)throw new Error("Session could not be loaded.");if(!result.data)notFound();const session=result.data;
 const client=await db.from("clients").select("primary_trainer_id").eq("id",session.client_id).maybeSingle();
 if(client.error)throw new Error("Client assignment unavailable.");if(!client.data||(me.data.role!=="owner"&&session.trainer_id!==user.id&&client.data.primary_trainer_id!==user.id))notFound();
 const ids=[session.client_id,...(session.trainer_id?[session.trainer_id]:[])];
 const [peopleQ,plansQ]=await Promise.all([
  db.from("profiles").select("id,full_name,email,phone,deleted_at").in("id",ids),
  db.from("plans").select("id,kind,tier,service_type,custom_label,current_session_number,total_sessions,sessions_used,status").eq("client_id",session.client_id).eq("status","active").order("created_at",{ascending:false}),
 ]);
 if(peopleQ.error||plansQ.error)throw new Error("Session context could not be loaded.");
 const person=peopleQ.data.find(p=>p.id===session.client_id),trainer=peopleQ.data.find(p=>p.id===session.trainer_id);if(!person||person.deleted_at)notFound();
 const asOf=new Date().toISOString();
 return <AppShell><SessionWorkspace asOf={asOf}><main className="mx-auto w-full max-w-5xl space-y-5 pb-12"><Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">← Today</Link>
 <header className="rounded-3xl bg-band p-5 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Coaching session</p><h1 className="mt-2 text-3xl font-bold">{person.full_name}</h1><p className="mt-2 text-sm text-white/75">{new Date(session.scheduled_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})} · {session.duration_minutes} min · {session.status.replaceAll("_"," ")}</p></header>
 {session.status==="completed"&&session.session_type==="training"&&!session.plan_id&&<p role="alert" className="rounded-xl border border-status-moderate/30 bg-white p-4 text-sm">This training session is completed without a linked package. Review billing evidence; completion is not proof of payment.</p>}
 <nav aria-label="Session workflow" className="grid grid-cols-3 gap-2">{[["#session-prep","1 · Prepare"],["#session-training","2 · Train"],["#session-close","3 · Review & close"]].map(([href,label])=><a key={href} href={href} className="flex min-h-12 items-center justify-center rounded-xl border border-divider bg-white px-2 text-center text-sm font-semibold text-sky">{label}</a>)}</nav>
 <section id="session-prep" className="scroll-mt-24 space-y-3"><SessionCoachPrep clientId={session.client_id} scheduledAt={session.scheduled_at}/><SessionLastDebrief sessionId={session.id}/></section>
 <SessionTrainingExecution sessionId={session.id} asOf={asOf}/>
 <SessionDetail key={session.id+session.status} session={{...session,client:person,trainer:trainer??null}} activePlans={plansQ.data??[]}/>
 </main></SessionWorkspace></AppShell>;
}
