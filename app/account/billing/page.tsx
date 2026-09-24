import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ReceiptText, CreditCard, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const money = (cents: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "—";

export default async function BillingHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || me.role !== "client") redirect("/dashboard");
  const { data: payments } = await supabase.from("payments")
    .select("id, amount_cents, currency, status, source, description, paid_at")
    .eq("client_id", user.id).order("paid_at", { ascending: false }).limit(100);
  const rows = payments ?? [];
  const paid = rows.filter((p: any) => p.status === "paid");
  const total = paid.reduce((sum: number, p: any) => sum + Number(p.amount_cents || 0), 0);
  return <AppShell><div className="flex flex-col gap-5">
    <Link href="/account" className="inline-flex w-fit items-center gap-1 text-sm text-cream-dim hover:text-cream"><ArrowLeft className="h-4 w-4"/>Account</Link>
    <div className="rounded-3xl bg-band px-6 py-7 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Your account</p><h1 className="mt-2 text-4xl font-bold">Billing history</h1><p className="mt-2 text-sm text-white/75">Payments recorded by IMS Coach OS.</p></div>
    <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-divider bg-white p-4"><CreditCard className="h-5 w-5 text-sky"/><p className="mt-3 text-2xl font-bold text-cream">{paid.length}</p><p className="text-xs text-cream-faint">Completed payments</p></div><div className="rounded-2xl border border-divider bg-white p-4"><ReceiptText className="h-5 w-5 text-sky"/><p className="mt-3 text-2xl font-bold text-cream">{money(total)}</p><p className="text-xs text-cream-faint">Recorded total</p></div></div>
    <div className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm">
      {rows.length === 0 ? <div className="p-8 text-center"><ReceiptText className="mx-auto h-7 w-7 text-cream-faint"/><p className="mt-3 font-medium text-cream">No payments recorded yet</p><p className="mt-1 text-sm text-cream-dim">New Coach OS payments will appear here after verified processing.</p></div> :
      <div className="divide-y divide-divider">{rows.map((p:any) => <div key={p.id} className="flex items-center justify-between gap-4 p-4"><div className="flex min-w-0 items-center gap-3">{p.status === "paid" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600"/> : p.status === "failed" ? <XCircle className="h-5 w-5 shrink-0 text-red-600"/> : <Clock3 className="h-5 w-5 shrink-0 text-amber-600"/>}<div className="min-w-0"><p className="truncate text-sm font-semibold text-cream">{p.description || "IMS payment"}</p><p className="text-xs text-cream-faint">{date(p.paid_at)} · {p.source || "payment"}</p></div></div><div className="text-right"><p className="font-semibold tabular text-cream">{money(Number(p.amount_cents), p.currency)}</p><p className="text-[11px] capitalize text-cream-faint">{p.status}</p></div></div>)}</div>}
    </div>
    <p className="text-center text-xs text-cream-faint">Need a receipt or have a billing question? Message your coach from Coach OS.</p>
  </div></AppShell>;
}
