import {redirect} from "next/navigation";
import {History,ShieldCheck,Activity,Users} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";

export const dynamic="force-dynamic";

export default async function AuditHistoryPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/settings/audit");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner"||me.data.deleted_at)redirect("/dashboard");
 const {q=""}=await searchParams;const needle=q.trim();
 let query=db.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,changes,created_at").order("created_at",{ascending:false}).limit(100);
 if(needle)query=query.or("action.ilike.%"+needle+"%,entity_type.ilike.%"+needle+"%");
 const logs=await query;if(logs.error)throw new Error("Audit history could not be loaded.");
 const actorIds=[...new Set((logs.data??[]).map(r=>r.actor_id).filter(Boolean))] as string[];
 const actors=actorIds.length?await db.from("profiles").select("id,full_name").in("id",actorIds):{data:[],error:null};
 if(actors.error)throw new Error("Audit actors could not be loaded.");
 const names=new Map((actors.data??[]).map(r=>[r.id,r.full_name]));const rows=logs.data??[];
 const since7=Date.now()-7*86400000,uniqueActors=new Set(rows.filter(r=>new Date(r.created_at).getTime()>=since7).map(r=>r.actor_id).filter(Boolean)).size;
 const entities=new Set(rows.map(r=>r.entity_type)).size;
 return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
  <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-white/60">Owner control center</p><h1 className="mt-2 text-4xl font-bold">Operational History</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">A durable record of important Coach OS changes so future operators can understand what happened without relying on memory.</p></header>
  <section className="grid grid-cols-3 gap-3"><div className="rounded-2xl border border-divider bg-white p-4"><History className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold">{rows.length}</p><p className="text-xs text-cream-faint">recent records loaded</p></div><div className="rounded-2xl border border-divider bg-white p-4"><Users className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold">{uniqueActors}</p><p className="text-xs text-cream-faint">actors · last 7d in view</p></div><div className="rounded-2xl border border-divider bg-white p-4"><Activity className="h-5 w-5 text-sky"/><p className="mt-3 text-3xl font-bold">{entities}</p><p className="text-xs text-cream-faint">entity types in view</p></div></section>
  <form className="rounded-2xl border border-divider bg-white p-4"><label className="text-xs font-semibold text-cream-dim">Filter action or entity<input name="q" defaultValue={needle} placeholder="program, client, session…" className="mt-1 min-h-11 w-full rounded-xl border border-divider px-3 text-sm"/></label></form>
  <section className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm"><div className="border-b border-divider p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-sky"/><h2 className="font-semibold text-cream">Audit trail</h2></div><p className="mt-1 text-xs text-cream-faint">Newest first · up to 100 matching records</p></div><div className="divide-y divide-divider">{rows.map(row=><article key={row.id} className="grid gap-2 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-start"><div><p className="text-sm font-semibold text-cream">{names.get(row.actor_id??"")??"System"}</p><p className="text-xs text-cream-faint">{new Date(row.created_at).toLocaleString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</p></div><div><p className="text-sm font-semibold text-cream">{row.action}</p><p className="mt-1 text-xs text-cream-dim">{row.entity_type}{row.entity_id?" · "+row.entity_id.slice(0,8):""}</p></div><div className="text-xs text-cream-faint">{row.changes&&typeof row.changes==="object"?Object.keys(row.changes as Record<string,unknown>).slice(0,3).join(", "):"recorded"}</div></article>)}{rows.length===0&&<p className="p-6 text-sm text-cream-dim">No matching audit records.</p>}</div></section>
 </main></AppShell>;
}