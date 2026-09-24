import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, ReceiptText, AlertTriangle, ArrowRight } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialSnapshot } from "@/lib/queries/financials";
import { RentersPanel } from "@/components/financials/renters-panel";
import { PaymentList } from "@/components/billing/payment-list";
import { type PaymentRecord, summarizePayments } from "@/lib/billing/payment-display";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financials");
  const { data: me, error: profileError } = await supabase.from("profiles")
    .select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (profileError || !me || me.deleted_at || me.role !== "owner") redirect("/dashboard");

  const svc = createServiceClient();
  const [snapshot, renters, payments] = await Promise.all([
    getFinancialSnapshot(svc).catch(() => null),
    svc.from("renters").select("id, name, discipline, monthly_rent_cents").eq("status", "active").order("name"),
    svc.from("payments").select("id, client_id, amount_cents, currency, status, source, description, paid_at, created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(8),
  ]);
  const recent: PaymentRecord[] = payments.error ? [] : payments.data ?? [];
  const clientIds = [...new Set(recent.flatMap((payment) => payment.client_id ? [payment.client_id] : []))];
  const namesResult = clientIds.length > 0
    ? await svc.from("profiles").select("id, full_name").in("id", clientIds)
    : { data: [], error: null };
  const clientNames: Record<string, string> = Object.fromEntries((namesResult.data ?? []).map((profile) => [profile.id, profile.full_name]));
  const summary = summarizePayments(recent);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/Los_Angeles" }).format(new Date());

  return <AppShell expectedRole="owner"><div className="flex min-w-0 flex-col gap-6">
    <header className="rounded-3xl bg-band px-5 py-7 text-white shadow-lg sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Studio operations</p>
      <h1 className="mt-2 text-4xl font-bold text-white">Financials</h1>
      <p className="mt-2 text-sm text-white/80">Payment records and operating estimates, with their limits made clear.</p>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Link href="/checkout" className="rounded-2xl border border-sky/30 bg-sky/5 p-4"><CreditCard aria-hidden="true" className="h-5 w-5 text-sky" /><p className="mt-3 text-sm font-semibold text-cream">New checkout</p><p className="text-xs text-cream-dim">Review in Stripe</p></Link>
      <div className="rounded-2xl border border-divider bg-white p-4"><ReceiptText aria-hidden="true" className="h-5 w-5 text-sky" /><p className="mt-3 text-2xl font-bold text-cream">{payments.error ? "Unavailable" : recent.length}</p><p className="text-xs text-cream-dim">Latest records · up to 8</p></div>
      <div className="rounded-2xl border border-divider bg-white p-4"><AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-700" /><p className="mt-3 text-2xl font-bold text-cream">{payments.error ? "Unavailable" : summary.failed}</p><p className="text-xs text-cream-dim">Failed among shown records</p></div>
      <Link href="/clients" className="rounded-2xl border border-divider bg-white p-4"><ArrowRight aria-hidden="true" className="h-5 w-5 text-sky" /><p className="mt-3 text-sm font-semibold text-cream">Client billing</p><p className="text-xs text-cream-dim">Packages and plans</p></Link>
    </div>

    {snapshot ? <>
      <Card><CardContent className="pt-6"><p className="text-xs uppercase tracking-widest text-cream-dim">Operating value estimate · {monthName}</p><p className="mt-2 break-all text-4xl font-bold tabular text-sky sm:text-5xl">{formatCurrency(snapshot.totalMonthlyRevenueCents)}</p><p className="mt-2 text-sm text-cream-dim">Active recurring plan values plus estimated value of delivered package sessions. Not collected cash, a bank balance, or an accounting statement.</p></CardContent></Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Membership MRR" value={formatCurrency(snapshot.membershipMrrCents)} hint="active plan value" />
        <Stat label="Renter rent" value={formatCurrency(snapshot.renterRentCents)} hint="monthly contracted value" />
        <Stat label="Recurring total" value={formatCurrency(snapshot.recurringMonthlyCents)} hint="memberships + rent" />
        <Stat label="Packages started" value={formatCurrency(snapshot.packageBookedThisMonthCents)} hint="recorded plan value; not proof of payment" />
      </div>
      <Card><CardHeader><CardTitle>Delivered package value</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div><p className="text-xs uppercase text-cream-dim">This week · Monday start</p><p className="mt-1 break-all text-3xl font-bold tabular text-sky">{formatCurrency(snapshot.packageEarnedThisWeekCents)}</p><p className="text-xs text-cream-dim">{snapshot.sessionsThisWeek} completed sessions</p></div>
        <div><p className="text-xs uppercase text-cream-dim">This month</p><p className="mt-1 break-all text-3xl font-bold tabular text-sky">{formatCurrency(snapshot.packageEarnedThisMonthCents)}</p><p className="text-xs text-cream-dim">{snapshot.sessionsThisMonth} completed sessions</p></div>
      </CardContent></Card>
      {snapshot.sessionsByTrainer.length > 0 && <Card><CardHeader><CardTitle>Sessions by trainer · {monthName}</CardTitle></CardHeader><CardContent className="space-y-3">{snapshot.sessionsByTrainer.map((trainer) => <div key={trainer.trainer_id} className="flex flex-wrap justify-between gap-3 text-sm text-cream"><span>{trainer.name}</span><span>{trainer.count} sessions</span></div>)}</CardContent></Card>}
    </> : <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950"><h2 className="font-semibold">Operating estimates unavailable</h2><p className="mt-1 text-sm">One of the source queries failed or exceeded its review limit. No zero-value estimates are being substituted.</p></section>}

    <Card><CardHeader><CardTitle>Recent payments</CardTitle></CardHeader><CardContent className="p-0">
      {payments.error ? <p role="alert" className="px-5 pb-5 text-sm text-amber-900">Payment records could not be loaded. This is not an empty or zero-balance ledger.</p> : <>
        {namesResult.error && <p role="status" className="px-5 pb-3 text-sm text-amber-900">Client names are temporarily unavailable; payment records are shown below.</p>}
        {recent.length === 0 ? <p className="px-5 pb-5 text-sm text-cream-dim">No Coach OS payment records found. Source-system history may still be awaiting reconciliation.</p> : <PaymentList rows={recent} clientNames={clientNames} />}
        {recent.length > 0 && <p className="px-5 py-4 text-xs text-cream-dim">Latest {recent.length} records by creation time, not the full ledger. Amounts retain their original currency. Dates use Pacific time.</p>}
      </>}
    </CardContent></Card>
    {renters.error ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Renter records could not be loaded. Editing is unavailable until the records can be read.</p> : <RentersPanel renters={renters.data ?? []} />}
    <p className="text-xs text-cream-dim">Package estimates use the plan value per completed session. Session allowances, payment records, credits and money owed are separate ledgers.</p>
  </div></AppShell>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <Card><CardContent className="pt-5"><p className="text-xs text-cream-dim">{label}</p><p className="mt-1 break-all text-2xl font-bold tabular text-sky">{value}</p><p className="mt-1 text-xs text-cream-dim">{hint}</p></CardContent></Card>;
}
