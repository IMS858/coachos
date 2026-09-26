import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {launchPriority,type LaunchSourceRecord} from "@/lib/migration/launch-priority";
import {pacificDate} from "@/lib/time/pacific";
import type {DestinationClient} from "@/lib/migration/client-match";
export const dynamic="force-dynamic";
const box="rounded-2xl border border-divider bg-white p-4";
const link="font-semibold text-sky";
const batchCols="id,label,status,staging_completed_at,expected_counts,source_manifest_sha256";
export default async function MigrationPriority({searchParams}:{searchParams:Promise<{batch?:string|string[]}>}){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Owner authorization unavailable.");if(!me.data||me.data.deleted_at||me.data.role!=="owner")redirect("/dashboard");
 const p=await searchParams;if(p.batch!==undefined&&(typeof p.batch!=="string"||!/^[0-9a-f-]{36}$/i.test(p.batch)))notFound();
 const q=db.from("migration_batches").select(batchCols);
 const b=p.batch?await q.eq("id",p.batch).maybeSingle():await q.order("created_at",{ascending:false}).order("id").limit(1).maybeSingle();
 if(b.error)throw new Error("Migration batch unavailable.");if(!b.data){if(p.batch)notFound();return <AppShell expectedRole="owner"><main className="mx-auto max-w-6xl p-5"><h1 className="text-3xl font-bold">Launch-priority migration</h1><p className="mt-3 text-cream-dim">No source batch is available.</p></main></AppShell>;}
 const batch=b.data;
 let source:LaunchSourceRecord[],profiles:{id:string;full_name:string;email:string|null;phone:string|null}[],clientIds:{id:string}[];
 try{[source,profiles,clientIds]=await Promise.all([
  readCompleteEvidence<LaunchSourceRecord>((from,to)=>db.from("migration_records").select("id,source_id,source_parent_id,source_payload,source_hash,reconciliation_status",{count:"exact"}).eq("batch_id",batch.id).in("record_type",["client","appointment"]).order("id").range(from,to)),
  readCompleteEvidence<{id:string;full_name:string;email:string|null;phone:string|null}>((from,to)=>db.from("profiles").select("id,full_name,email,phone",{count:"exact"}).eq("role","client").is("deleted_at",null).order("id").range(from,to)),
  readCompleteEvidence<{id:string}>((from,to)=>db.from("clients").select("id",{count:"exact"}).order("id").range(from,to))
 ]);}catch{return <AppShell expectedRole="owner"><main className="mx-auto max-w-6xl space-y-4 p-5"><h1 className="text-3xl font-bold">Launch-priority evidence unavailable</h1><section role="alert" className={box}>A source or destination page failed to load completely. No match, empty calendar, or readiness state was inferred.</section></main></AppShell>;}
 const ids=new Set(clientIds.map(x=>x.id)),destination:DestinationClient[]=profiles.filter(x=>ids.has(x.id)).map(x=>({id:x.id,name:x.full_name,email:x.email,phone:x.phone}));
 const today=pacificDate(new Date()),result=launchPriority(source,destination,today),destinationNames=new Map(destination.map(x=>[x.id,x.name]));
 const matched=result.rows.filter(x=>x.matchStatus==="matched").length,needs=result.rows.filter(x=>x.matchStatus==="needs_review").length,unmatched=result.rows.filter(x=>x.matchStatus==="unmatched").length,total=result.rows.reduce((s,x)=>s+x.futureAppointments,0);
 return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-12">
  <header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Migration / Launch priority</p><h1 className="mt-2 text-3xl font-bold">Future-calendar client resolver</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{batch.label}. This is a fresh destination comparison against staged source evidence. Matches are proposals—not merges, account creation, appointment import, or approval.</p></header>
  <section className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["Client candidates",result.rows.length],["Future source rows",total],["Contact-supported",matched],["Needs review",needs],["Unmatched",unmatched]].map(([label,value])=><article key={String(label)} className={box}><p className="text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-cream-faint">{label}</p></article>)}</section>
  <section className={box}><h2 className="text-lg font-semibold">Evidence boundary</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Source wall dates/times are shown exactly as staged and are not converted to UTC. Source timezone and calendar-block duration remain unverified, so even contact-supported identities are not appointment-import clearance. Shared contacts, different names, name-only candidates and unmatched people stay held.</p><p className="mt-2 text-xs text-cream-faint">Pacific comparison date: {today}. Orphan appointment identities: {result.orphanAppointments}. Invalid source dates: {result.invalidDates}. Staging receipt: {batch.staging_completed_at?"recorded":"missing"}. Batch status: {batch.status}.</p></section>
  <section className="space-y-3">{result.rows.map(row=>{const tone=row.matchStatus==="matched"?"text-sky":row.matchStatus==="needs_review"?"text-status-moderate":"text-status-limited";const dest=row.destinationId?destinationNames.get(row.destinationId):null;return <article key={row.sourceClientId} className={box}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{row.clientName}</h2><p className="text-xs text-cream-faint">Vagaro candidate {row.sourceClientId}</p></div><p className={"text-xs font-semibold "+tone}>{row.matchStatus==="matched"?"CONTACT-SUPPORTED PROPOSAL":row.matchStatus==="needs_review"?"NEEDS REVIEW":"NO DESTINATION CANDIDATE"}</p></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-cream-faint">Future rows</p><p className="font-semibold">{row.futureAppointments}</p></div><div><p className="text-xs text-cream-faint">Jason / Gabriel</p><p className="font-semibold">{row.jason} / {row.gabriel}</p></div><div><p className="text-xs text-cream-faint">First source wall</p><p className="font-semibold">{row.firstWall??"Time unavailable"}</p></div><div><p className="text-xs text-cream-faint">Last source wall</p><p className="font-semibold">{row.lastWall??"Time unavailable"}</p></div></div><p className="mt-3 text-xs leading-5 text-cream-dim">{dest&&<>Suggested destination: {dest}. </>}Evidence: {row.matchBasis.length?row.matchBasis.join(" · "):"no exact destination evidence"}. Other-trainer rows: {row.otherTrainer}.</p>{row.sourceRecordId&&row.reviewPage&&<Link className={"mt-3 inline-flex min-h-11 items-center "+link} href={"/settings/migration/review?batch="+batch.id+"&type=client&page="+row.reviewPage+"&record="+row.sourceRecordId}>Open owner identity review →</Link>}</article>})}</section>
  <div className="flex flex-wrap gap-5"><Link href={"/settings/migration/preflight?batch="+batch.id} className={link}>Calendar preflight →</Link><Link href={"/settings/migration/review?batch="+batch.id+"&type=package&page=1"} className={link}>Package openings →</Link><Link href={"/settings/migration?batch="+batch.id} className={link}>Migration Center →</Link></div>
 </main></AppShell>;
}
