import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {FuelWorkspace} from "@/components/fuel/workspace";
import {FuelReviewQueue} from "@/components/fuel/review-queue";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
export const dynamic="force-dynamic";
export default async function FuelPage(){const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect("/login");const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)throw Error("Fuel authorization unavailable.");if(!me.data||me.data.deleted_at)redirect("/dashboard");if(me.data.role==="client")return <FuelWorkspace clientId={user.id}/>;if(!["owner","trainer"].includes(me.data.role))redirect("/dashboard");
 const clients=await readCompleteEvidence<{id:string;primary_trainer_id:string|null}>((from,to)=>{let q=db.from("clients").select("id,primary_trainer_id",{count:"exact"});if(me.data!.role==="trainer")q=q.eq("primary_trainer_id",user.id);return q.order("id").range(from,to);});
 const ids=new Set(clients.map(c=>c.id));const people=await readCompleteEvidence<{id:string;full_name:string}>((from,to)=>db.from("profiles").select("id,full_name",{count:"exact"}).eq("role","client").is("deleted_at",null).order("id").range(from,to));
 return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-12"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Coaching system</p><h1 className="mt-2 text-4xl font-bold">Fuel & Performance</h1><p className="mt-3 text-sm leading-6 text-white/75">Plan → daily habits → weekly review → measured progress. Private drafts, client reports and coach decisions remain distinct.</p></header><FuelReviewQueue/><section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Open a client workspace</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{people.filter(p=>ids.has(p.id)).sort((a,b)=>a.full_name.localeCompare(b.full_name)).map(person=><Link key={person.id} href={`/clients/${person.id}/fuel`} className="flex min-h-14 items-center justify-between rounded-xl border border-divider p-3 text-sm font-semibold text-sky"><span>{person.full_name}</span><span aria-hidden="true">→</span></Link>)}</div>{!clients.length&&<p className="mt-3 text-sm text-cream-dim">No assigned clients available.</p>}</section></main></AppShell>;
}
