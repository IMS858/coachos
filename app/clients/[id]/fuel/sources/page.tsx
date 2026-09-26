import Link from "next/link";
import {notFound} from "next/navigation";
import {AppShell} from "@/components/layout/app-shell";
import {fuelAccess} from "@/lib/fuel/load";
import {FuelSourceDocuments} from "@/components/fuel/source-documents";
export const dynamic="force-dynamic";
export default async function FuelSources({params}:{params:Promise<{id:string}>}){const {id}=await params,access=await fuelAccess(id);if(!access.staff)notFound();return <AppShell><main className="mx-auto max-w-4xl space-y-5 pb-12"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Private fuel evidence</p><h1 className="mt-2 text-3xl font-bold">{access.person.full_name}</h1><p className="mt-3 text-sm leading-6 text-white/75">Original documents support coaching decisions. A file is not an automatically published plan, client match or verified test.</p><Link href={`/clients/${id}/fuel`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold">← Fuel & Performance</Link></header><FuelSourceDocuments clientId={id}/></main></AppShell>;}
