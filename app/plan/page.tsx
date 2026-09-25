import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient,createServiceClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {SendToCoach} from "@/components/media/send-to-coach";
import {ClientCoachingThread} from "@/components/media/client-coaching-thread";
import {ClipPlayback} from "@/components/media/clip-playback";
export const dynamic="force-dynamic";
const time=(value:string)=>new Date(value).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"});
export default async function PlanPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/plan");
 const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(viewer.error)throw new Error("Account authorization unavailable.");if(!viewer.data||viewer.data.deleted_at||viewer.data.role!=="client")redirect("/dashboard");
 const [programQ,upcomingQ,homeworkQ]=await Promise.all([
  db.from("programs").select("id,name,weeks,start_date,end_date,status,pdf_client_url").eq("client_id",user.id).in("status",["active","published"]).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("sessions").select("id,scheduled_at,session_type,duration_minutes,status").eq("client_id",user.id).gte("scheduled_at",new Date().toISOString()).in("status",["requested","scheduled","confirmed"]).order("scheduled_at").limit(8),
  db.from("client_media").select("id,kind,title,note,exercise_id,storage_path").eq("client_id",user.id).neq("uploaded_by",user.id).is("archived_at",null).order("created_at",{ascending:false}).limit(20),
 ]);
 const ids=[...new Set((homeworkQ.data??[]).map(h=>h.exercise_id).filter((id):id is string=>!!id))];
 const [exercisesQ,reviewsQ]=ids.length?await Promise.all([
  db.from("exercises").select("id,video_url,client_visible").in("id",ids),
  createServiceClient().from("exercise_reviews").select("exercise_id,safety_status").in("exercise_id",ids),
 ]):[{data:[],error:null},{data:[],error:null}];
 const videoUnavailable=!!homeworkQ.error||!!exercisesQ.error||!!reviewsQ.error;
 const approved=new Set((reviewsQ.data??[]).filter(r=>r.safety_status==="approved").map(r=>r.exercise_id));
 const exercises=new Map((exercisesQ.data??[]).map(e=>[e.id,e]));
 const demos=videoUnavailable?[]:(homeworkQ.data??[]).filter(h=>!h.exercise_id||(approved.has(h.exercise_id)&&exercises.get(h.exercise_id)?.client_visible));
 const program=programQ.data;
 return <AppShell><main className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-12">
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">Your IMS coaching</p><h1 className="mt-2 text-4xl font-bold">My Plan</h1><p className="mt-3 text-sm leading-6 text-white/80">Your published training, demonstrations and coach feedback in one place.</p></header>
  <nav aria-label="My training" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["/workouts","Workout history"],["/progress","My progress"],["/book","Book a session"],["/messages","Message coach"]].map(([href,label])=><Link key={href} href={href} className="flex min-h-14 items-center justify-center rounded-xl border border-divider bg-white px-3 text-center text-sm font-semibold text-sky">{label}</Link>)}</nav>
  <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold text-cream">Current training</h2>
   {programQ.error?<p role="alert" className="mt-3 text-sm text-status-limited">Your program could not be loaded. This does not mean your coach removed it. Refresh to retry.</p>:program?<><h3 className="mt-3 text-lg font-semibold">{program.name}</h3><p className="mt-2 text-sm text-cream-dim">{program.weeks?program.weeks+"-week program · ":""}{program.status}</p><div className="mt-4 flex flex-wrap gap-3"><Link href={"/programs/"+program.id} className="inline-flex min-h-12 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white">Open my workouts →</Link>{program.pdf_client_url&&<a href={"/api/programs/"+program.id+"/pdf"} className="inline-flex min-h-12 items-center rounded-xl border border-divider px-4 text-sm font-semibold text-sky">Download reviewed PDF</a>}</div></>:<p className="mt-3 text-sm leading-6 text-cream-dim">No published program is assigned yet. Your coach will share it here when ready. You can still message your coach and send a form video; an assessment is not required to use these tools.</p>}
  </section>
  <section id="exercise-videos" className="scroll-mt-24 rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold text-cream">Coach-approved demonstrations</h2>
   {videoUnavailable?<p role="alert" className="mt-3 text-sm text-status-limited">Demonstration eligibility or media could not be loaded. Unverified demonstrations were not shown.</p>:demos.length?<div className="mt-4 space-y-3">{demos.map(demo=>{const exercise=demo.exercise_id?exercises.get(demo.exercise_id):null;const url=exercise?.video_url;return <article key={demo.id} className="rounded-xl border border-divider p-4"><h3 className="font-semibold">{demo.title}</h3>{demo.note&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-cream-dim">{demo.note}</p>}{demo.exercise_id?(typeof url==="string"&&url.startsWith("https://")?<a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 items-center text-sm font-semibold text-sky">Open approved exercise demo →</a>:<p className="mt-2 text-sm text-cream-dim">No playable demonstration is attached.</p>):<ClipPlayback id={demo.id} kind={demo.kind} title={demo.title}/>}</article>;})}</div>:<p className="mt-3 text-sm text-cream-dim">Your coach-approved exercise videos will appear here when assigned.</p>}
  </section>
  <SendToCoach/><ClientCoachingThread clientId={user.id}/>
  <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold text-cream">Upcoming sessions</h2>
   {upcomingQ.error?<p role="alert" className="mt-3 text-sm text-status-limited">Upcoming sessions could not be loaded. Refresh before assuming a booking is missing.</p>:(upcomingQ.data??[]).length?<div className="mt-3 divide-y divide-divider">{upcomingQ.data!.map(session=><Link key={session.id} href={"/sessions/"+session.id} className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-semibold text-cream">{time(session.scheduled_at)}</p><p className="mt-1 text-xs text-cream-dim">{session.session_type.replaceAll("_"," ")} · {session.duration_minutes} min</p></div><span className="text-xs font-semibold text-sky">{session.status==="requested"?"Awaiting coach confirmation":"View session →"}</span></Link>)}</div>:<p className="mt-3 text-sm text-cream-dim">No upcoming sessions are currently booked.</p>}
  </section>
 </main></AppShell>;
}
