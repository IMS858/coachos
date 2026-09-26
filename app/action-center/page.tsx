import Link from "next/link";
import {redirect} from "next/navigation";
import {Inbox,Target,CreditCard,PackageSearch,Dumbbell,UserRoundCheck,ArrowRight,CalendarCheck,Video} from "lucide-react";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {loadActionCenter, type ActionQueue} from "@/lib/action-center/load";
import {FuelReviewQueue} from "@/components/fuel/review-queue";
import {ReloadPageButton} from "@/components/ui/reload-page-button";
export const dynamic="force-dynamic";
const icons = {requests:CalendarCheck,messages:Inbox,"form-video-actions":Video,programs:Dumbbell,quiet:UserRoundCheck,classes:CalendarCheck,leads:Target,payments:CreditCard,packages:PackageSearch};
function Queue({value}:{value:ActionQueue}) {
 return <section id={value.id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-divider bg-white shadow-sm"><header className="flex items-center justify-between gap-3 border-b border-divider px-5 py-4"><div><h2 className="font-semibold text-cream">{value.title}</h2>{value.total!==null&&<p className="mt-1 text-xs text-cream-faint">{value.rows.length} shown of {value.total} matching records</p>}</div><Link href={value.href} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-sky">View all <ArrowRight className="h-3 w-3"/></Link></header>
 {value.status==="unavailable"?<div role="alert" className="space-y-3 p-5"><p className="font-semibold text-status-limited">Queue unavailable</p><p className="text-sm leading-6 text-cream-dim">This queue could not be verified. Its count is unknown—not zero. Other available queues remain usable.</p><ReloadPageButton label="Retry loading queues"/></div>:value.rows.length?<div className="divide-y divide-divider">{value.rows.map(row=><Link key={row.key} href={row.href} className="block px-5 py-3 transition hover:bg-sky/[0.035]"><p className="break-words text-sm font-semibold text-cream">{row.title}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-cream-dim">{row.meta}</p></Link>)}</div>:<p className="p-5 text-sm leading-6 text-cream-dim">{value.empty}</p>}
 </section>;
}
export default async function ActionCenterPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/action-center");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Action Center authorization unavailable.");
 if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))redirect("/dashboard");
 const role=me.data.role==="owner"?"owner":"trainer",isOwner=role==="owner";
 const data=await loadActionCenter(db,{id:user.id,role});
 const unavailable=data.queues.filter(q=>q.status==="unavailable").length;
 const known=data.queues.reduce((sum,q)=>sum+(q.total??0),0);
 return <AppShell expectedRole={role}><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/65">{isOwner?"Owner action center":"Coach action center"}</p><h1 className="mt-2 text-4xl font-bold">{isOwner?"What needs attention":"What needs handling"}</h1><p className="mt-3 text-sm text-white/80">{isOwner?"Current client work and real business exceptions, connected to their next action.":"Your clients, your programs, your messages and training requests—without owner finance noise."}</p><p className="mt-2 text-xs leading-5 text-white/75">{unavailable?`${known} actions in available queues · ${unavailable} queues unavailable · total incomplete`:`${known} matching action records`} · fuel check-ins are counted separately below</p></header>
  {(unavailable>0||data.namesUnavailable)&&<section role="alert" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-status-moderate/40 bg-white p-5"><div><h2 className="font-semibold text-cream">Some evidence needs another load</h2><p className="mt-1 text-sm leading-6 text-cream-dim">{unavailable>0?"Unavailable queues are marked individually. No empty or all-clear state was inferred.":"Client names could not be loaded. Counts and record links remain available; names are labeled unavailable."}</p></div><ReloadPageButton/></section>}
  <section aria-label="Action queues" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.queues.map(q=>{const Icon=icons[q.id as keyof typeof icons]??Inbox;return <Link key={q.id} href={"#"+q.id} className="rounded-2xl border border-divider bg-white p-4 transition hover:border-sky/50"><Icon className="h-5 w-5 text-sky"/><p className={q.total===null?"mt-3 text-base font-semibold text-status-limited":"mt-3 text-3xl font-bold text-cream"}>{q.total===null?"Unavailable":q.total}</p><p className="mt-1 text-xs text-cream-faint">{q.label}</p></Link>;})}</section>
  <FuelReviewQueue/>
  <div className="grid gap-4 lg:grid-cols-2">{data.queues.map(value=><Queue key={value.id} value={value}/>)}</div>
  <p className="text-xs leading-5 text-cream-faint">Each queue shows up to 20 entries with its matching-record count. Class prep covers the next 7 days. Evidence read completed {data.observedAt}; paged observations are not a transaction-isolated snapshot. Historical contacts, unqualified research and saved exercise selections do not inflate action counts.</p>
 </main></AppShell>;
}
