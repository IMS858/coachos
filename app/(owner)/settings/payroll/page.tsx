import Link from "next/link";
import {redirect} from "next/navigation";
import {BadgeDollarSign,Download,ShieldCheck,ExternalLink} from "lucide-react";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {CompensationEditor} from "@/components/settings/compensation-editor";

export const dynamic="force-dynamic";
export default async function PayrollSettingsPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login?next=/settings/payroll");
 const me=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();if(me.error||me.data?.role!=="owner")redirect("/dashboard");
 const qbConfigured=Boolean(process.env.QUICKBOOKS_CLIENT_ID&&process.env.QUICKBOOKS_CLIENT_SECRET);
 const [trainersQ,rulesQ]=await Promise.all([db.from("profiles").select("id,full_name").in("role",["owner","trainer"]).is("deleted_at",null).order("full_name"),db.from("trainer_compensation_rules").select("trainer_id,compensation_type,rate_cents,late_cancel_rate_cents,no_show_rate_cents,provider,provider_employee_id,effective_from,notes,active").order("trainer_id")]);
 if(trainersQ.error||rulesQ.error)throw new Error("Payroll configuration could not be loaded.");
 return <AppShell expectedRole="owner"><main className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-6">
  <header className="rounded-3xl bg-band p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-white/60">Owner settings</p><h1 className="mt-2 text-4xl font-bold">Payroll Integration</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Coach OS prepares session/time evidence. Your payroll provider remains authoritative for wages, withholding, taxes and filings.</p></header>
  <section className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-divider bg-white p-5 shadow-sm"><BadgeDollarSign className="h-5 w-5 text-sky"/><h2 className="mt-3 font-semibold">QuickBooks Payroll</h2><p className="mt-2 text-sm leading-6 text-cream-dim">{qbConfigured?"Server credentials are present. OAuth/company authorization still needs an owner-reviewed connection before payroll writes are enabled.":"Not connected in Coach OS yet. We can connect Intuit OAuth after your compensation rules and company mapping are reviewed."}</p><span className={"mt-4 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold "+(qbConfigured?"bg-status-moderate/10 text-status-moderate":"bg-surface-soft text-cream-dim")}>{qbConfigured?"Credentials staged":"Not connected"}</span></div>
  <div className="rounded-2xl border border-divider bg-white p-5 shadow-sm"><ShieldCheck className="h-5 w-5 text-sky"/><h2 className="mt-3 font-semibold">Owner approval boundary</h2><p className="mt-2 text-sm leading-6 text-cream-dim">No automatic payroll submission. A future provider sync will show the pay period, trainer mappings, session evidence and calculated values before any write is approved.</p></div></section>
  <CompensationEditor trainers={trainersQ.data??[]} rules={rulesQ.data??[]}/>
  <section className="rounded-2xl border border-divider bg-white p-5"><h2 className="font-semibold">Current Coach OS payroll data</h2><p className="mt-2 text-sm leading-6 text-cream-dim">Completed sessions, delivered minutes, late cancellations and no-shows are available now. Compensation rates are intentionally not inferred from package prices.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/reports/payroll" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white"><ExternalLink className="h-4 w-4"/>Open Payroll Center</Link><Link href="/reports/payroll" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider px-4 text-sm font-semibold text-cream"><Download className="h-4 w-4"/>Review / export evidence</Link></div></section>
  <p className="text-xs leading-5 text-cream-faint">Next provider step: configure explicit trainer compensation rules, map each trainer to the payroll provider employee/contractor record, then enable owner-reviewed OAuth sync. Nothing will be submitted automatically.</p>
 </main></AppShell>;
}