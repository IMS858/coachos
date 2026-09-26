import {redirect} from "next/navigation";
import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {AppShell} from "@/components/layout/app-shell";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {RentersPanel} from "@/components/financials/renters-panel";
import {FinancialEvidencePanel} from "@/components/financials/evidence-panel";
import {PaymentList} from "@/components/billing/payment-list";
import {loadFinancialEvidence} from "@/lib/financials/load";
import {captureFinancialEvidence} from "@/lib/financials/evidence";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!user) redirect("/login?next=/financials");
  const {data: me, error} = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (error || !me || me.deleted_at || me.role !== "owner") redirect("/dashboard");
  // Authorization precedes every ledger read. The authenticated client retains RLS.
  const data = await loadFinancialEvidence(db);
  const recent = data.payments.status === "ready" ? [...data.payments.value.rows]
    .sort((a, b) => (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0) || b.id.localeCompare(a.id)).slice(0, 8) : [];
  const clientIds = [...new Set(recent.flatMap(row => row.client_id ? [row.client_id] : []))];
  const people = await captureFinancialEvidence(async () => clientIds.length ? readCompleteEvidence<{id: string; full_name: string}>((a, b) =>
    db.from("profiles").select("id,full_name", {count: "exact"}).in("id", clientIds).order("id").range(a, b)) : [], "Client names are temporarily unavailable; the recorded payments remain below.");
  const names = people.status === "ready" ? Object.fromEntries(people.value.map(person => [person.id, person.full_name])) : {};
  const renters = data.renters;
  return <AppShell expectedRole="owner"><div className="flex min-w-0 flex-col gap-6">
    <header className="rounded-3xl bg-band px-5 py-7 text-white shadow-lg sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Studio operations</p>
      <h1 className="mt-2 text-4xl font-bold text-white">Financials</h1>
      <p className="mt-2 text-sm text-white/80">Training value, recorded collections and unresolved money. No invented accounting history.</p>
    </header>
    <nav aria-label="Financial workflows" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["/checkout", "New checkout"], ["/clients", "Client billing"], ["/reports/training-value", "Training value"], ["/settings/migration", "Reconcile sources"]].map(([href, label]) => <Link key={href} href={href} className="flex min-h-12 items-center justify-center rounded-2xl border border-divider bg-white px-4 py-3 text-center text-sm font-semibold text-sky">{label} →</Link>)}
    </nav>
    <FinancialEvidencePanel data={data}/>
    <Card><CardHeader><CardTitle>Recent payments</CardTitle></CardHeader><CardContent className="p-0">
      {data.payments.status === "unavailable" ? <p role="alert" className="px-5 pb-5 text-sm">{data.payments.message}</p> : <>
        {people.status === "unavailable" && <p role="status" className="px-5 pb-3 text-sm">{people.message}</p>}
        {recent.length ? <PaymentList rows={recent} clientNames={names}/> : <p className="px-5 pb-5 text-sm text-cream-dim">No Coach OS payment records found. Source-system history may still be awaiting reconciliation.</p>}
        <p className="px-5 py-4 text-xs text-cream-dim">Latest {recent.length} records by creation time, not a monthly or lifetime total. The evidence cards above use the complete loaded ledger and actual payment dates.</p>
      </>}
    </CardContent></Card>
    {renters.status === "unavailable" ? <p role="alert" className="rounded-xl border border-divider p-4 text-sm">{renters.message}</p>
      : renters.value.value.unknownRecords > 0 ? <p role="alert" className="rounded-xl border border-divider p-4 text-sm">Renter prices need review. No missing rent was converted to zero; renter editing is held until the source rates are resolved.</p>
      : <RentersPanel renters={renters.value.rows.map(row => ({...row, monthly_rent_cents: row.monthly_rent_cents!}))}/>}
    <p className="text-xs leading-5 text-cream-dim">Read-only reporting does not create payments, invoices, package usage or payroll submissions. QuickBooks reconciliation and verified package openings remain separate owner workflows.</p>
  </div></AppShell>;
}
