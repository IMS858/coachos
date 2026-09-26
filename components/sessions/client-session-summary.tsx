import {notFound} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
export async function ClientSessionSummary({sessionId,clientId}:{sessionId:string;clientId:string}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user||user.id!==clientId)notFound();
 const profile=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(profile.error)throw new Error("Appointment authorization unavailable.");if(!profile.data||profile.data.role!=="client"||profile.data.deleted_at)notFound();
 // Do not fetch private coach notes, program internals or financial fields into this client surface.
 const result=await db.from("sessions").select("id,scheduled_at,duration_minutes,session_type,status,location").eq("id",sessionId).eq("client_id",clientId).maybeSingle();
 if(result.error)throw new Error("Your appointment could not be loaded. Refresh to retry.");if(!result.data)notFound();const session=result.data;
 const requested=session.status==="requested";
 return <AppShell><main className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-12"><Link href="/plan" className="inline-flex min-h-12 items-center text-sm font-semibold text-sky">← My Plan</Link>
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Your appointment</p><h1 className="mt-2 text-3xl font-bold">{session.session_type==="assessment"?"Movement assessment":"Coaching session"}</h1><p className="mt-3 text-lg">{new Date(session.scheduled_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"long",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})}</p><p className="mt-2 text-sm text-white/80">{session.duration_minutes} minutes · {requested?"Awaiting coach confirmation":session.status.replaceAll("_"," ")}</p></header>
  <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold">Session details</h2>{session.location&&<p className="mt-3 text-sm text-cream-dim">Location: {session.location}</p>}<p className="mt-3 text-sm leading-6 text-cream-dim">{requested?"This is a request, not a confirmed appointment. Your coach will confirm whether the time is available.":"Your appointment status is shown above. Contact your coach about any changes; opening this page does not cancel or reschedule your session."}</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/messages" className="inline-flex min-h-12 items-center rounded-xl bg-sky px-4 text-sm font-semibold text-white">Message my coach</Link><Link href="/plan" className="inline-flex min-h-12 items-center rounded-xl border border-divider px-4 text-sm font-semibold text-sky">My training plan</Link></div></section>
 </main></AppShell>;
}
