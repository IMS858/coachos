import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";
import {REVIEW_UUID} from "@/lib/migration/owner-review";
export const dynamic="force-dynamic";
export default async function MigrationPreflight({searchParams}:{searchParams:Promise<{batch?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
 if(me.error)throw new Error("Owner authorization unavailable.");
 if(!me.data||me.data.deleted_at||me.data.role!=="owner")redirect("/dashboard");
 const params=await searchParams;
 if(params.batch&&!REVIEW_UUID.test(params.batch))notFound();
 const batchQ=params.batch?await db.from("migration_batches").select("id,label").eq("id",params.batch).maybeSingle():await db.from("migration_batches").select("id,label").order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(batchQ.error)throw new Error("Migration batch unavailable.");
 if(!batchQ.data)return <AppShell expectedRole="owner"><main className="mx-auto max-w-5xl p-5"><h1 className="text-3xl font-bold">Calendar preflight</h1><p className="mt-3 text-sm text-cream-dim">No migration batch is available.</p></main></AppShell>;
 const batch=batchQ.data;
 const recordsQ=await db.from("migration_records").select("id,dry_run_status",{count:"exact"}).eq("batch_id",batch.id).eq("record_type","appointment");
 if(recordsQ.error||recordsQ.count===null)throw new Error("Appointment evidence unavailable.");
 const rows=recordsQ.data??[];
 const ready=rows.filter(r=>r.dry_run_status==="ready").length;
 const held=rows.filter(r=>r.dry_run_status==="hold").length;
 const pending=rows.length-ready-held;
 return <AppShell expectedRole="owner"><main className="mx-auto flex max-w-5xl flex-col gap-5 pb-12"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Migration preflight</p><h1 className="mt-2 text-3xl font-bold">Calendar cutover evidence</h1><p className="mt-3 text-sm leading-6 text-white/75">{batch.label}. Stored dry-run results only; ready is not import approval.</p></header><section className="grid grid-cols-3 gap-3">{[["Ready",ready],["Held",held],["Needs preflight",pending]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-divider bg-white p-4"><p className="text-3xl font-bold text-cream">{value}</p><p className="mt-1 text-xs text-cream-faint">{label}</p></div>)}</section><section className="rounded-2xl border border-divider bg-white p-5"><h2 className="text-lg font-semibold text-cream">Next gate</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Owner-review the source appointment, then record a fresh collision check against the live schedule. No appointment is created here.</p><div className="mt-4 flex flex-wrap gap-4"><Link href={"/settings/migration/review?batch="+batch.id+"&type=appointment&page=1"} className="font-semibold text-sky">Review appointments →</Link><Link href={"/settings/migration?batch="+batch.id} className="font-semibold text-sky">Migration Center →</Link></div></section></main></AppShell>;
}
