import {notFound} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {fuelAccess} from "@/lib/fuel/load";
import {loadBuildEvidence} from "@/lib/coaching/build-load";
import {buildKind,buildMode,latestBodPod} from "@/lib/coaching/build";
import {CoachingBuilder} from "@/components/coaching/builder";
export const dynamic="force-dynamic";
export default async function BuildPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{kind?:string;mode?:string;assessment?:string}>}){
 const [{id},query]=await Promise.all([params,searchParams]);const access=await fuelAccess(id);if(!access.staff)notFound();
 const evidence=await loadBuildEvidence(access.db,id,access.person.full_name,query.assessment);
 return <AppShell><CoachingBuilder evidence={evidence} initialKind={buildKind(query.kind)} initialMode={buildMode(query.mode,Boolean(latestBodPod(evidence)))}/></AppShell>;
}
