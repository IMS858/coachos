import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {FuelPlanView} from "@/components/fuel/plan-view";
import {fuelDate} from "@/lib/fuel/model";
import {sampleFuelStrategy} from "@/lib/coaching/build";
export const dynamic="force-dynamic";
export default async function SampleFuelPage(){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();if(!user)redirect("/login");const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)throw Error("Sample access unavailable.");if(!me.data||me.data.deleted_at||!["owner","trainer"].includes(me.data.role))redirect("/dashboard");const today=fuelDate();
 return <AppShell><main className="mx-auto max-w-5xl space-y-5 pb-16"><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs font-semibold tracking-widest">SAMPLE — NOT ASSIGNED</p><h1 className="mt-3 text-3xl font-bold">See the coaching experience</h1><p className="mt-3 text-sm leading-6 text-white/80">A display-only example. No client record is loaded, no assessment is fabricated, and nothing can be saved, assigned or published here.</p><Link href="/fuel" className="mt-4 inline-flex min-h-11 items-center font-semibold text-white">← Back to Fuel &amp; Performance</Link></header><section className="rounded-3xl border border-divider bg-white p-5"><FuelPlanView plan={sampleFuelStrategy(today)} today={today}/></section><section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Training + Fuel, one review workspace</h2><p className="mt-3 text-sm leading-6 text-cream-dim">For a real client, Build Both opens their assessment-based private training draft alongside the Fuel Strategy. Exercise selection still uses the reviewed assessment and the existing generator safety gates. This sample does not assign exercises, loads or clearance.</p><Link href="/clients" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky">Choose a client to build from real evidence →</Link></section></main></AppShell>;
}
