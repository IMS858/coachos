import Link from "next/link";
import {Activity,CalendarCheck,ClipboardCheck,Dumbbell,Scale,ListChecks} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {isExerciseSet} from "@/lib/exercises/catalog";

type TimelineItem={key:string;at:string;kind:"session"|"assessment"|"program"|"body"|"decision";title:string;detail:string;href?:string};
const icon={session:CalendarCheck,assessment:ClipboardCheck,program:Dumbbell,body:Scale,decision:ListChecks} as const;

export async function ClientCoachingTimeline({clientId}:{clientId:string}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();if(!user)return null;
 const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(viewer.error||!viewer.data||viewer.data.deleted_at||!["owner","trainer"].includes(viewer.data.role))return null;
 const [sessionsQ,assessQ,programsQ,bodyQ,decisionsQ]=await Promise.all([
  db.from("sessions").select("id,status,scheduled_at,session_type").eq("client_id",clientId).in("status",["completed","no_show","late_cancelled"]).order("scheduled_at",{ascending:false}).limit(40),
  db.from("assessments").select("id,status,assessment_date").eq("client_id",clientId).order("assessment_date",{ascending:false}).limit(20),
  db.from("programs").select("id,name,status,data,created_at,updated_at,published_at").eq("client_id",clientId).order("updated_at",{ascending:false}).limit(40),
  db.from("body_comp_records").select("id,recorded_at,weight_lb,body_fat_pct").eq("client_id",clientId).order("recorded_at",{ascending:false}).limit(20),
  db.from("program_decision_notes").select("id,program_id,category,note,created_at").eq("client_id",clientId).order("created_at",{ascending:false}).limit(30),
 ]);
 if([sessionsQ,assessQ,programsQ,bodyQ,decisionsQ].some(q=>q.error))return <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold text-cream">Coaching timeline</h2><p role="alert" className="mt-2 text-sm text-status-limited">Durable coaching history could not be loaded. Refresh to retry.</p></section>;
 const items:TimelineItem[]=[];
 for(const s of sessionsQ.data??[])items.push({key:"s:"+s.id,at:s.scheduled_at,kind:"session",title:s.status==="completed"?"Training delivered":s.status==="no_show"?"No-show recorded":"Late cancellation recorded",detail:String(s.session_type??"training").replaceAll("_"," "),href:`/sessions/${s.id}`});
 for(const a of assessQ.data??[])items.push({key:"a:"+a.id,at:a.assessment_date+"T12:00:00Z",kind:"assessment",title:a.status==="complete"?"Assessment completed":"Assessment "+String(a.status).replaceAll("_"," "),detail:"Assessment evidence",href:"/assessments"});
 for(const p of programsQ.data??[]){if(isExerciseSet(p.data))continue;items.push({key:"p:"+p.id,at:p.published_at??p.updated_at??p.created_at,kind:"program",title:p.status==="draft"?"Program draft updated":"Program "+p.status,detail:p.name||"Training program",href:`/programs/${p.id}`})}
 for(const b of bodyQ.data??[]){const details=[b.weight_lb!=null?`${b.weight_lb} lb`:"",b.body_fat_pct!=null?`${b.body_fat_pct}% body fat`:""].filter(Boolean).join(" · ");items.push({key:"b:"+b.id,at:b.recorded_at+"T12:00:00Z",kind:"body",title:"Body composition recorded",detail:details||"Measurement saved"})}
 for(const d of decisionsQ.data??[])items.push({key:"d:"+d.id,at:d.created_at,kind:"decision",title:"Program decision · "+String(d.category).replaceAll("_"," "),detail:d.note,href:`/programs/${d.program_id}`});
 items.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const shown=items.slice(0,18);
 return <section className="rounded-3xl border border-divider bg-white p-5 shadow-sm" aria-label="Durable client history"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky/10 p-2.5"><Activity className="h-5 w-5 text-sky"/></div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky">One client · one history</p><h2 className="mt-1 text-lg font-semibold text-cream">Coaching timeline</h2><p className="mt-1 text-sm leading-6 text-cream-dim">Sessions, assessments, program changes and measurements in one chronological record. Entries show recorded events, not inferred outcomes.</p></div></div>
 {shown.length?<div className="mt-5 divide-y divide-divider">{shown.map(item=>{const Icon=icon[item.kind];const content=<div className="flex gap-3 py-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-soft"><Icon className="h-4 w-4 text-sky"/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-cream">{item.title}</p><time className="text-[11px] text-cream-faint">{new Date(item.at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",year:"numeric"})}</time></div><p className="mt-1 text-xs capitalize text-cream-dim">{item.detail}</p></div></div>;return item.href?<Link key={item.key} href={item.href} className="block transition hover:bg-surface-soft">{content}</Link>:<div key={item.key}>{content}</div>})}</div>:<p className="mt-5 rounded-xl bg-surface-soft p-4 text-sm text-cream-dim">No coaching-history events are recorded yet.</p>}
 {items.length>shown.length&&<p className="mt-3 text-xs text-cream-faint">Showing the most recent {shown.length} of {items.length} loaded coaching events.</p>}
 </section>;
}
