import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {CLASS_LAUNCH_GATES,inventoryEvidence,inventoryLabel} from "@/lib/classes/launch";
export const dynamic="force-dynamic";
export default async function ClassLaunchPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/classes/manage/launch");
 const me=await db.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();if(me.error)throw new Error("Owner authorization unavailable.");if(!me.data||me.data.deleted_at||me.data.role!=="owner")redirect("/dashboard");
 const definitions=[
  {table:"class_templates",label:"Class templates",meaning:"Definitions for the offering; not a launch approval."},
  {table:"class_series",label:"Recurring rules",meaning:"Planned weekly delivery; not a guarantee of available space."},
  {table:"class_occurrences",label:"Class dates",meaning:"Stored occurrences; includes unreleased and historical dates."},
  {table:"class_programs",label:"Class programs",meaning:"Coach delivery plans; never automatically an individual prescription."},
  {table:"class_program_assignments",label:"Program assignment records",meaning:"Evidence linking a delivery plan to an occurrence."},
  {table:"class_access_products",label:"Class access products",meaning:"Separate entitlement definitions, not payment-provider readiness."},
  {table:"client_class_access",label:"Client access records",meaning:"Configured class access; not verified balances or revenue."},
  {table:"class_credit_ledger",label:"Credit evidence rows",meaning:"Class-only credit history; no private-session consumption."},
  {table:"class_delivery_notes",label:"Delivery observations",meaning:"Recorded class observations, not attendance or payroll approval."},
  {table:"class_compensation_rules",label:"Instructor compensation rules",meaning:"Owner-only rules; class pricing never determines instructor pay."},
 ] as const;
 const queries=await Promise.all(definitions.map(async definition=>({...definition,evidence:inventoryEvidence(await db.from(definition.table).select("id",{count:"exact",head:true}))})));
 return <AppShell expectedRole="owner"><div className="mx-auto w-full max-w-5xl space-y-5 pb-12"><Link href="/classes/manage" className="inline-flex min-h-11 items-center text-sm font-semibold text-sky">← Class Operations</Link><header className="rounded-3xl bg-band p-6 text-white"><p className="text-xs uppercase tracking-widest text-white/60">IMS / Owner launch control</p><h1 className="mt-2 text-4xl font-bold">Build the offering. Verify the launch.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">Classes connect to coaching, scheduling, client history and business operations without pretending every configuration record is a live service.</p></header>
 <section className="rounded-2xl border border-sky/20 bg-sky/5 p-5"><h2 className="text-xl font-semibold">Registration remains in prelaunch</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Private authoring can continue. This page does not publish a class, enroll anyone, send announcements, charge a client or submit payroll. There is deliberately no one-click launch or financial write.</p></section>
 <section><h2 className="text-xl font-semibold">Current source inventory</h2><p className="mt-2 text-sm text-cream-dim">Exact record counts from the signed-in owner’s permitted sources. A count is inventory—not readiness, utilization, revenue or verified compensation.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{queries.map(item=><article key={item.table} className="rounded-2xl border border-divider bg-white p-4"><h3 className="text-sm font-semibold">{item.label}</h3><p className="mt-3 text-2xl font-bold text-sky" role={item.evidence.state==="unavailable"?"alert":undefined}>{inventoryLabel(item.evidence)}</p><p className="mt-2 text-xs leading-5 text-cream-dim">{item.evidence.state==="unavailable"?"Source could not be read or its migration has not been applied. No zero was substituted.":item.meaning}</p></article>)}</div></section>
 <section className="rounded-3xl border border-divider bg-white p-5"><h2 className="text-xl font-semibold">Launch checks still requiring evidence</h2><div className="mt-4 divide-y divide-divider">{CLASS_LAUNCH_GATES.map(gate=><article key={gate.key} className="py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{gate.title}</h3><span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-semibold text-cream-dim">Not verified for launch</span></div><p className="mt-2 text-sm leading-6 text-cream-dim">{gate.detail}</p></article>)}</div></section>
 <div className="flex flex-wrap gap-3"><Link href="/schedule" className="inline-flex min-h-12 items-center rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-sky">Coaching schedule</Link><Link href="/reports/payroll" className="inline-flex min-h-12 items-center rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-sky">Payroll evidence</Link><Link href="/growth" className="inline-flex min-h-12 items-center rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-sky">Growth attribution</Link></div></div></AppShell>;
}
