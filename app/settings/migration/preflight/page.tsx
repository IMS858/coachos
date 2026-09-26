import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {REVIEW_UUID,object} from "@/lib/migration/owner-review";
import {appointmentPreflight} from "@/lib/migration/appointment-preflight";

export const dynamic="force-dynamic";

type SourceRow={id:string;source_hash:string;source_id:string};
type ReviewRow={record_id:string;source_hash:string;decision:string;proposal:unknown;revision:number};
type SessionRow={id:string;client_id:string;trainer_id:string|null;scheduled_at:string;duration_minutes:number|null;status:string};

function endAt(start:string,duration:number){return Date.parse(start)+duration*60000;}
function overlaps(aStart:number,aEnd:number,bStart:number,bEnd:number){return aStart<bEnd&&bStart<aEnd;}

export default async function MigrationPreflight({searchParams}:{searchParams:Promise<{batch?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Owner authorization unavailable.");
 if(!me.data||me.data.deleted_at||me.data.role!=="owner")redirect("/dashboard");
 const params=await searchParams;
 if(params.batch&&!REVIEW_UUID.test(params.batch))notFound();
 const batchQ=params.batch
  ? await db.from("migration_batches").select("id,label,status").eq("id",params.batch).maybeSingle()
  : await db.from("migration_batches").select("id,label,status").order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(batchQ.error)throw new Error("Migration batch unavailable.");
 if(!batchQ.data)return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl p-5"><h1 className="text-3xl font-bold">Calendar preflight</h1><p className="mt-3 text-sm text-cream-dim">No migration batch is available.</p></main></AppShell>;
 const batch=batchQ.data;
 const records=await readCompleteEvidence<SourceRow>((from,to)=>db.from("migration_records").select("id,source_hash,source_id",{count:"exact"}).eq("batch_id",batch.id).eq("record_type","appointment").order("id").range(from,to));
 const latest:ReviewRow[]=[];
 for(let i=0;i<records.length;i+=100){
  const ids=records.slice(i,i+100).map(r=>r.id);
  if(!ids.length)continue;
  const q=await db.from("migration_latest_record_reviews").select("record_id,source_hash,decision,proposal,revision").in("record_id",ids);
  if(q.error)throw new Error("Owner review evidence unavailable.");
  latest.push(...((q.data??[]) as ReviewRow[]));
 }
 const sourceById=new Map(records.map(r=>[r.id,r]));
 const reviewed=latest.filter(r=>r.decision==="reviewed"&&sourceById.get(r.record_id)?.source_hash===r.source_hash);
 const parsed=reviewed.flatMap(r=>{
  const p=object(r.proposal);
  const client=typeof p?.client_id==="string"?p.client_id:null;
  const trainer=typeof p?.trainer_id==="string"?p.trainer_id:null;
  const starts=typeof p?.starts_at==="string"?p.starts_at:null;
  const duration=typeof p?.duration_minutes==="number"?p.duration_minutes:null;
  const basic=starts&&duration!==null?appointmentPreflight(starts,duration):{status:"hold" as const,reason:"Missing reviewed schedule fields"};
  return client&&trainer&&starts&&duration!==null&&basic.status==="ready"?[{record:r,client,trainer,starts,duration}]:[];
 });
 let sessions:SessionRow[]=[];
 if(parsed.length){
  const starts=parsed.map(x=>Date.parse(x.starts)).filter(Number.isFinite);
  const lo=new Date(Math.min(...starts)-8*60*60*1000).toISOString();
  const hi=new Date(Math.max(...parsed.map(x=>endAt(x.starts,x.duration)))+8*60*60*1000).toISOString();
  sessions=await readCompleteEvidence<SessionRow>((from,to)=>db.from("sessions").select("id,client_id,trainer_id,scheduled_at,duration_minutes,status",{count:"exact"}).gte("scheduled_at",lo).lt("scheduled_at",hi).order("scheduled_at").range(from,to));
 }
 const results=parsed.map(item=>{
  const a=Date.parse(item.starts),b=endAt(item.starts,item.duration);
  const active=sessions.filter(s=>!["cancelled","late_cancelled"].includes(s.status));
  const exact=active.find(s=>s.client_id===item.client&&s.trainer_id===item.trainer&&Date.parse(s.scheduled_at)===a&&(s.duration_minutes??60)===item.duration);
  if(exact)return {...item,status:"hold" as const,reason:"Exact operational duplicate"};
  const coach=active.find(s=>{if(s.trainer_id!==item.trainer)return false;const x=Date.parse(s.scheduled_at),y=endAt(s.scheduled_at,s.duration_minutes??60);return overlaps(a,b,x,y);});
  if(coach)return {...item,status:"hold" as const,reason:"Trainer schedule collision"};
  const client=active.find(s=>{if(s.client_id!==item.client)return false;const x=Date.parse(s.scheduled_at),y=endAt(s.scheduled_at,s.duration_minutes??60);return overlaps(a,b,x,y);});
  if(client)return {...item,status:"hold" as const,reason:"Client schedule collision"};
  return {...item,status:"ready" as const,reason:null};
 });
 const ready=results.filter(r=>r.status==="ready").length,held=results.length-ready;
 const staleOrHeld=latest.filter(r=>r.decision!=="reviewed"||sourceById.get(r.record_id)?.source_hash!==r.source_hash).length;
 return <AppShell expectedRole="owner"><main className="mx-auto flex max-w-6xl flex-col gap-5 pb-12">
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Migration preflight</p><h1 className="mt-2 text-3xl font-bold">Fresh calendar collision check</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{batch.label}. This reads current Coach OS sessions against owner-reviewed appointment proposals. It does not import, edit or notify anyone.</p><div className="mt-4 flex flex-wrap gap-4"><Link href={"/settings/migration/review?batch="+batch.id+"&type=appointment&page=1"} className="text-sm font-semibold text-white">Review appointments →</Link><Link href={"/settings/migration?batch="+batch.id} className="text-sm font-semibold text-white">Migration Center →</Link></div></header>
  <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Source appointments",records.length],["Reviewed & parseable",parsed.length],["Fresh preflight ready",ready],["Fresh holds",held]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-divider bg-white p-4"><p className="text-3xl font-bold text-cream">{value}</p><p className="mt-1 text-xs text-cream-faint">{label}</p></div>)}</section>
  <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Cutover rule</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Only current owner-reviewed proposals with a verified client, coach, explicit time, duration and status are evaluated. Exact duplicates, trainer overlaps and client overlaps are held. A ready result is preflight evidence only, not import approval.</p>{staleOrHeld>0&&<p className="mt-3 text-sm text-status-limited">{staleOrHeld} reviewed-history rows are held, excluded or stale and are not eligible for this preflight.</p>}</section>
  {results.length===0?<section className="rounded-2xl border border-divider bg-white p-8 text-center"><h2 className="text-lg font-semibold text-cream">No owner-reviewed appointments are ready for live collision checking</h2><p className="mt-2 text-sm text-cream-dim">Stage the source appointment rows and complete owner review first. Nothing is inferred from an empty or partial batch.</p></section>:<section className="overflow-hidden rounded-2xl border border-divider bg-white"><div className="divide-y divide-divider">{results.slice(0,200).map(r=><div key={r.record.record_id} className="grid gap-2 p-4 sm:grid-cols-[1fr_160px_1fr]"><div><p className="text-sm font-semibold text-cream">{new Date(r.starts).toLocaleString("en-US",{timeZone:"America/Los_Angeles",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p><p className="mt-1 text-xs text-cream-faint">{r.duration} min · review v{r.record.revision}</p></div><div><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold "+(r.status==="ready"?"bg-status-optimal/10 text-status-optimal":"bg-status-limited/10 text-status-limited")}>{r.status==="ready"?"Ready":"Hold"}</span></div><p className="text-sm text-cream-dim">{r.reason??"No operational collision found in the current schedule window."}</p></div>)}</div>{results.length>200&&<p className="border-t border-divider p-4 text-xs text-cream-faint">Showing the first 200 of {results.length} reviewed appointments.</p>}</section>}
 </main></AppShell>;
}
