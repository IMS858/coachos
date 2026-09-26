import {redirect} from "next/navigation";
import Link from "next/link";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {BookingForm} from "@/components/booking/booking-form";
import {packageBalance} from "@/lib/billing/package-balance";
export const dynamic="force-dynamic";
export const metadata={title:"Book a Session"};
export default async function BookPage(){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/book");
  const viewer=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(viewer.error)throw new Error("Account authorization unavailable.");
  if(!viewer.data||viewer.data.deleted_at||viewer.data.role!=="client")redirect("/dashboard");
  const [plansQ,sessionsQ]=await Promise.all([
    db.from("plans").select("id,kind,status,total_sessions,sessions_used,current_session_number,expires_at,custom_label,tier").eq("client_id",user.id).eq("status","active").eq("kind","package").eq("service_type","training").order("created_at").order("id"),
    db.from("sessions").select("id,scheduled_at,session_type,status,duration_minutes").eq("client_id",user.id).gte("scheduled_at",new Date().toISOString()).in("status",["requested","scheduled","confirmed"]).order("scheduled_at").limit(10),
  ]);
  const pack=plansQ.data?.[0],balance=pack?packageBalance(pack):null;
  return <AppShell><main className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">Your IMS coaching</p><h1 className="mt-2 text-3xl font-bold">Book a session</h1><p className="mt-3 text-sm leading-6 text-white/80">Request a time. Your coach confirms it separately; a request is not a reserved appointment.</p></header>
    <section className="rounded-2xl border border-divider bg-white p-4"><h2 className="text-sm font-semibold">Training package</h2>
      {plansQ.error?<p role="alert" className="mt-2 text-sm text-status-limited">Package records could not be loaded. No zero balance or missing package has been assumed.</p>:balance?.state==="known"?<><p className="mt-2 text-3xl font-bold">{balance.remaining}</p><p className="text-sm text-cream-dim">sessions remaining in {pack?.custom_label||"your earliest active training package"}</p>{balance.remaining===0&&<p className="mt-2 text-sm text-cream-dim">Package depleted. You may request a time; your coach must review the package separately.</p>}</>:balance?.state==="unknown"?<p role="status" className="mt-2 text-sm text-cream-dim">Your package counters need review. Ask your coach before relying on a remaining-session number.</p>:<p className="mt-2 text-sm text-cream-dim">No active training package is recorded in Coach OS. Records from another system may not have been migrated.</p>}
      {(plansQ.data?.length??0)>1&&<p className="mt-2 text-xs text-cream-faint">Multiple packages are recorded; they are listed separately in Account.</p>}<Link href="/account" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Review your plans →</Link>
    </section>
    <BookingForm/>
    <Link href="/classes" className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs font-semibold uppercase text-sky">Group coaching</p><p className="mt-1 font-semibold">Browse IMS classes →</p><p className="mt-1 text-sm text-cream-dim">Class information and recorded participation. Registration remains closed during prelaunch.</p></Link>
    <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold">Your upcoming sessions</h2>
      {sessionsQ.error?<p role="alert" className="mt-3 text-sm text-status-limited">Your sessions could not be loaded. Refresh before assuming a booking is missing.</p>:(sessionsQ.data??[]).length?<div className="mt-3 divide-y divide-divider">{sessionsQ.data!.map(s=><Link key={s.id} href={"/sessions/"+s.id} className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-semibold">{new Date(s.scheduled_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZoneName:"short"})}</p><p className="mt-1 text-xs text-cream-dim">{s.session_type} · {s.duration_minutes} min</p></div><span className="text-xs font-semibold text-sky">{s.status==="requested"?"Awaiting confirmation":s.status} →</span></Link>)}</div>:<p className="mt-3 text-sm text-cream-dim">No upcoming sessions are recorded. Request a time above.</p>}
    </section>
  </main></AppShell>;
}
