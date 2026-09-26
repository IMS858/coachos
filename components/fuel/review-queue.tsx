import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {fuelDate,shiftDate,pendingCheckins,type Journal,type Review,type Checkin} from "@/lib/fuel/model";

function Unavailable() {
  return <section role="alert" className="rounded-2xl border border-divider bg-white p-4"><h2 className="font-semibold">Fuel check-ins unavailable</h2><p className="mt-2 text-sm text-cream-dim">Fuel authorization or evidence lookup is unavailable. No zero-action count was inferred. Other action queues remain separate.</p><Link href="/fuel" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Open Fuel &amp; Performance →</Link></section>;
}

/** One authenticated RLS client; failure of this queue never removes other coaching work. */
export async function FuelReviewQueue() {
  try {
    const db=await createClient(),{data:{user},error:authError}=await db.auth.getUser();
    if(authError) return <Unavailable/>;
    if(!user)return null;
    const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
    if(me.error)return <Unavailable/>;
    if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))return null;
    const from=shiftDate(fuelDate(),-27);
    const entries=await readCompleteEvidence<Journal>((a,b)=>db.from("fuel_journal_entries")
      .select("id,client_id,kind,entry_date,revision,payload,plan_version_id,created_at",{count:"exact"})
      .eq("kind","weekly").gte("entry_date",from).order("id").range(a,b));
    const reviews:Review[]=[];
    for(let offset=0;offset<entries.length;offset+=100) {
      const ids=entries.slice(offset,offset+100).map(entry=>entry.id);
      reviews.push(...await readCompleteEvidence<Review>((a,b)=>db.from("fuel_coach_reviews")
        .select("id,client_id,entry_id,note,disposition,created_at",{count:"exact"}).in("entry_id",ids).order("id").range(a,b)));
    }
    const pending=pendingCheckins(entries,reviews),ids=[...new Set(pending.map(entry=>entry.client_id))];
    const names=new Map<string,string>();
    for(let offset=0;offset<ids.length;offset+=100) {
      const rows=await readCompleteEvidence<{id:string;full_name:string}>((a,b)=>db.from("profiles")
        .select("id,full_name",{count:"exact"}).in("id",ids.slice(offset,offset+100)).order("id").range(a,b));
      for(const row of rows)names.set(row.id,row.full_name);
    }
    return <section className="rounded-2xl border border-sky/20 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Fuel check-ins</h2><p className="mt-1 text-xs text-cream-dim">{pending.length} awaiting coach review · past 28 days · assigned clients only for trainers</p></div><Link href="/fuel" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">Fuel &amp; Performance →</Link></div><div className="mt-3 space-y-2">{pending.slice(0,10).map(entry=><Link key={entry.id} href={`/clients/${entry.client_id}/fuel#fuel-checkins`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-surface-soft p-3"><div><p className="text-sm font-semibold">{names.get(entry.client_id)??"Client name unavailable"}</p><p className="mt-1 text-xs text-cream-faint">{entry.entry_date} · revision {entry.revision}</p></div><span className="text-xs font-semibold text-sky">{(entry.payload as Checkin).contact_requested?"Contact requested":"Review"}</span></Link>)}</div>{!pending.length&&<p className="mt-3 text-sm text-cream-dim">No unanswered fuel check-ins in this window.</p>}{pending.length>10&&<p className="mt-3 text-xs text-cream-faint">Showing the latest 10. All entries remain available in each client&apos;s workspace.</p>}</section>;
  } catch {
    return <Unavailable/>;
  }
}
