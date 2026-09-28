import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";
const TYPES=["client","appointment","series","package","membership","transaction"] as const;
const PAGE_SIZE=50;

function displayValue(value: unknown){
  if(value===null||value===undefined||value==="") return "—";
  if(typeof value==="object") return JSON.stringify(value);
  return String(value);
}

export default async function MigrationEvidencePage({
  searchParams,
}:{
  searchParams:Promise<{batch?:string;type?:string;page?:string}>;
}){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!user)redirect("/login?next=/settings/migration/evidence");
  const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(me.error||!me.data||me.data.role!=="owner"||me.data.deleted_at)redirect("/dashboard");

  const params=await searchParams;
  const type=(params.type??"client") as (typeof TYPES)[number];
  if(!TYPES.includes(type))notFound();
  const page=Math.max(1,Number.parseInt(params.page??"1",10)||1);

  let batch:any=null;
  if(params.batch){
    if(!/^[0-9a-f-]{36}$/i.test(params.batch))notFound();
    const selected=await db.from("migration_batches").select("id,label,status,source_as_of").eq("id",params.batch).maybeSingle();
    if(selected.error||!selected.data)notFound();
    batch=selected.data;
  }else{
    const latest=await db.from("migration_batches").select("id,label,status,source_as_of").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(latest.error)throw new Error("Migration batch could not be loaded.");
    batch=latest.data;
  }
  if(!batch)return <AppShell expectedRole="owner"><main className="mx-auto max-w-6xl p-6"><h1 className="text-3xl font-bold">Source evidence</h1><p className="mt-3 text-cream-dim">No migration batch is available.</p></main></AppShell>;

  const from=(page-1)*PAGE_SIZE,to=from+PAGE_SIZE-1;
  const result=await db.from("migration_records")
    .select("id,record_type,source_id,source_payload,reconciliation_status,destination_id,destination_trainer_id,created_at",{count:"exact"})
    .eq("batch_id",batch.id).eq("record_type",type)
    .order("source_id").range(from,to);
  if(result.error||result.count===null)throw new Error("Source evidence could not be loaded completely.");

  const total=result.count,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(page>pages)notFound();

  const counts=await Promise.all(TYPES.map(async kind=>{
    const q=await db.from("migration_records").select("id",{count:"exact",head:true}).eq("batch_id",batch.id).eq("record_type",kind);
    if(q.error||q.count===null)throw new Error("Source evidence counts could not be loaded.");
    return [kind,q.count] as const;
  }));
  const countMap=new Map(counts);
  const href=(kind:string,p=1)=>`/settings/migration/evidence?batch=${batch.id}&type=${kind}&page=${p}`;

  return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-12">
    <header className="rounded-3xl bg-band p-6 text-white">
      <p className="text-xs uppercase tracking-widest text-white/60">IMS / Verified source evidence</p>
      <h1 className="mt-2 text-4xl font-bold">Vagaro source browser</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">{batch.label} · {batch.status}. This is the saved source evidence and import state—not a claim that every historical source row is a live Coach OS client, payment or completed session.</p>
    </header>
    <div className="flex flex-wrap gap-2">
      {TYPES.map(kind=><Link key={kind} href={href(kind)} className={`rounded-xl border px-4 py-3 text-sm font-semibold ${kind===type?"border-sky bg-sky text-white":"border-divider bg-white text-cream"}`}>{kind[0].toUpperCase()+kind.slice(1)} · {countMap.get(kind)??0}</Link>)}
    </div>
    <section className="rounded-3xl border border-divider bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold capitalize text-cream">{type} evidence</h2><p className="mt-1 text-sm text-cream-dim">{total} source rows · page {page} of {pages}</p></div>
        <Link href={`/settings/migration?batch=${batch.id}`} className="text-sm font-semibold text-sky">Migration Center →</Link>
      </div>
      <div className="mt-5 divide-y divide-divider">
        {(result.data??[]).map((row:any)=>{
          const fields=row.source_payload?.fields && typeof row.source_payload.fields==="object" ? row.source_payload.fields : {};
          return <details key={row.id} className="py-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-semibold text-cream">{fields["Source Name"]??fields["Client Name"]??fields["Client"]??fields["Owner"]??fields["Appointment / Customer"]??row.source_id}</p><p className="mt-1 break-all text-xs text-cream-faint">Source ID: {row.source_id}</p></div>
                <div className="flex gap-2"><span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs text-cream-dim">{row.reconciliation_status}</span>{row.destination_id&&<span className="rounded-full bg-sky/10 px-2.5 py-1 text-xs text-sky">destination linked</span>}</div>
              </div>
            </summary>
            <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-2xl bg-surface-soft p-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(fields).map(([key,value])=><div key={key} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-cream-faint">{key}</dt><dd className="mt-1 break-words text-sm text-cream">{displayValue(value)}</dd></div>)}
            </dl>
            <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-sky">Provenance & raw evidence</summary><pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-[#101317] p-4 text-xs text-white/80">{JSON.stringify(row.source_payload,null,2)}</pre></details>
          </details>;
        })}
      </div>
      <div className="mt-5 flex items-center justify-between">
        {page>1?<Link className="min-h-11 py-3 font-semibold text-sky" href={href(type,page-1)}>← Previous</Link>:<span/>}
        {page<pages?<Link className="min-h-11 py-3 font-semibold text-sky" href={href(type,page+1)}>Next →</Link>:<span/>}
      </div>
    </section>
  </main></AppShell>;
}
