import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ReceiptText, CheckCircle2, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { PaymentList } from "@/components/billing/payment-list";
import { formatPaymentAmount, summarizePayments, type PaymentRecord } from "@/lib/billing/payment-display";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

export default async function BillingHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");
  const { data: me, error: profileError } = await supabase.from("profiles")
    .select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (profileError || !me || me.deleted_at || me.role !== "client") redirect("/dashboard");

  // Explicit ownership filter supplements RLS. This read never uses service role.
  const { data, error } = await supabase.from("payments")
    .select("id, amount_cents, currency, status, source, description, paid_at, created_at")
    .eq("client_id", user.id).order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  const rows: PaymentRecord[] = error ? [] : (data ?? []).slice(0, PAGE_SIZE);
  const hasMore = !error && (data?.length ?? 0) > PAGE_SIZE;
  const summary = summarizePayments(rows);

  return <AppShell><div className="flex min-w-0 flex-col gap-5">
    <Link href="/account" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-cream-dim hover:text-cream"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Account</Link>
    <header className="rounded-3xl bg-band px-5 py-7 text-white shadow-lg sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">Your account</p>
      <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Billing history</h1>
      <p className="mt-2 text-sm text-white/80">Your payment records, separate from your remaining sessions.</p>
    </header>

    {error ? <section role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <h2 className="font-semibold">Payment history is temporarily unavailable</h2>
      <p className="mt-1 text-sm">We could not load your records. This does not mean your balance is zero or your payments are missing.</p>
      <Link href="/account/billing" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">Try again</Link>
    </section> : <>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-2xl border border-divider bg-white p-4"><CheckCircle2 aria-hidden="true" className="h-5 w-5 text-sky" /><p className="mt-3 text-3xl font-bold text-cream">{summary.succeeded}</p><p className="mt-1 text-xs text-cream-dim">Successful payments shown</p></div>
        <div className="min-w-0 rounded-2xl border border-divider bg-white p-4"><ReceiptText aria-hidden="true" className="h-5 w-5 text-sky" /><p className="mt-3 text-3xl font-bold text-cream">{rows.length}</p><p className="mt-1 text-xs text-cream-dim">Records in this view</p></div>
      </div>
      {summary.currencies.length > 0 && <section aria-labelledby="payment-totals" className="rounded-2xl border border-divider bg-white p-5">
        <h2 id="payment-totals" className="font-semibold text-cream">Totals for these records</h2>
        <p className="mt-1 text-xs text-cream-dim">Currencies stay separate. These are not account balances or amounts due.</p>
        {summary.currencies.map((group) => <dl key={group.currency} className="mt-4 grid grid-cols-1 gap-3 border-t border-divider pt-4 sm:grid-cols-3">
          <div><dt className="text-xs text-cream-dim">Received · {group.currency}</dt><dd className="mt-1 break-all font-semibold tabular text-cream">{formatPaymentAmount(group.received, group.currency)}</dd></div>
          <div><dt className="text-xs text-cream-dim">Refunds · {group.currency}</dt><dd className="mt-1 break-all font-semibold tabular text-cream">{formatPaymentAmount(group.refunded, group.currency)}</dd></div>
          <div><dt className="text-xs text-cream-dim">Net recorded · {group.currency}</dt><dd className="mt-1 break-all font-semibold tabular text-cream">{formatPaymentAmount(group.net, group.currency)}</dd></div>
        </dl>)}
      </section>}
      {summary.needsReview > 0 && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle aria-hidden="true" className="mr-2 inline h-4 w-4" />{summary.needsReview} record(s) need review and are excluded from the totals.</p>}
      <section className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm" aria-label="Payment history">
        {rows.length === 0 ? <div className="p-7 text-center"><ReceiptText aria-hidden="true" className="mx-auto h-7 w-7 text-cream-dim" /><h2 className="mt-3 font-semibold text-cream">No payments recorded yet</h2><p className="mt-2 text-sm text-cream-dim">This view shows Coach OS records only. Payments from another system may not have been migrated.</p></div> : <PaymentList rows={rows} />}
      </section>
      <p className="text-xs text-cream-dim">{hasMore ? "Showing the 100 most recently recorded entries. Older records are not included in these totals." : `Showing ${rows.length} recorded entries.`} Dates are displayed in Pacific time.</p>
    </>}
    <Link href="/messages" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-sky/30 bg-white px-4 py-3 text-center text-sm font-semibold text-sky-deep">Ask your coach about a payment or receipt</Link>
  </div></AppShell>;
}
