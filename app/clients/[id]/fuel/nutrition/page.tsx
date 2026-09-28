import Link from "next/link";
import {notFound} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {fuelAccess,loadFuel} from "@/lib/fuel/load";
import {BodPodNutritionBuilder} from "@/components/fuel/bod-pod-nutrition-builder";
export const dynamic="force-dynamic";
export default async function NutritionFromBodPod({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{source?:string}>}){
 const [{id},query]=await Promise.all([params,searchParams]),access=await fuelAccess(id);if(!access.staff)notFound();
 const [data,sources]=await Promise.all([loadFuel(access.db,id),access.db.from("fuel_source_documents").select("id,original_name,created_at").eq("client_id",id).order("created_at",{ascending:false}).limit(50)]);
 if(sources.error)throw Error("Private Bod Pod sources are unavailable.");
 const latest=data.versions[0]??null,release=data.releases[0]??null;
 return <AppShell><main className="mx-auto max-w-6xl space-y-5 pb-16"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Bod Pod → Nutrition</p><h1 className="mt-2 text-3xl font-bold">{access.person.full_name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">Upload or select the IMS Bod Pod report, confirm the measured values, add the coaching context, and create a private nutrition draft. Nothing publishes automatically.</p><div className="mt-4 flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center text-sm font-semibold" href={"/clients/"+id}>← Client profile</Link><Link className="inline-flex min-h-11 items-center text-sm font-semibold" href={"/clients/"+id+"/fuel"}>Fuel &amp; Performance →</Link></div></header><BodPodNutritionBuilder clientId={id} clientName={access.person.full_name} today={data.asOf} sources={sources.data??[]} initialSourceId={query.source} latest={latest} release={release}/></main></AppShell>;
}
