import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialSnapshot } from "@/lib/queries/financials";
import { RentersPanel } from "@/components/financials/renters-panel";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { CreditCard, ReceiptText, AlertTriangle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * /financials — owner-only money picture. Pulls memberships, renter rent, and
 * package revenue (earned + booked) into weekly/monthly views.
 */
export default async function FinancialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/financials");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.role !== "owner") redirect("/dashboard");

  const svc = createServiceClient();
  const f = await getFinancialSnapshot(svc);

  const { data: rentersList } = await svc
    .from("renters")
    .select("id, name, discipline, monthly_rent_cents")
    .eq("status", "active")
    .order("name", { ascending: true });

  const { data: recentPayments } = await svc.from("payments").select("id, client_id, amount_cents, currency, status, description, paid_at").order("paid_at", { ascending: false }).limit(8);
  const paymentClientIds = [...new Set((recentPayments ?? []).map((p: any) => p.client_id).filter(Boolean))];
  const { data: paymentProfiles } = paymentClientIds.length ? await svc.from("profiles").select("id, full_name").in("id", paymentClientIds) : { data: [] as any[] };
  const paymentNames = new Map((paymentProfiles ?? []).map((p: any) => [p.id, p.full_name]));
  const failedPayments = (recentPayments ?? []).filter((p: any) => p.status === "failed").length;

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date());

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <div className="eyebrow">Studio</div>
          <h1 className="text-3xl font-bold text-cream">Financials</h1>
          <p className="text-cream-faint text-sm">
            Your full revenue picture — recurring income plus delivered package
            revenue.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Link href="/checkout" className="rounded-2xl border border-sky/20 bg-sky/5 p-4 transition hover:border-sky/50"><CreditCard className="h-5 w-5 text-sky"/><p className="mt-3 text-sm font-semibold text-cream">New checkout</p><p className="text-xs text-cream-faint">Sell a plan securely</p></Link><div className="rounded-2xl border border-divider bg-white p-4"><ReceiptText className="h-5 w-5 text-sky"/><p className="mt-3 text-2xl font-bold text-cream">{recentPayments?.length ?? 0}</p><p className="text-xs text-cream-faint">Recent payment records</p></div><div className="rounded-2xl border border-divider bg-white p-4"><AlertTriangle className="h-5 w-5 text-amber-600"/><p className="mt-3 text-2xl font-bold text-cream">{failedPayments}</p><p className="text-xs text-cream-faint">Recent failed payments</p></div><Link href="/clients" className="rounded-2xl border border-divider bg-white p-4 transition hover:border-sky/50"><ArrowRight className="h-5 w-5 text-sky"/><p className="mt-3 text-sm font-semibold text-cream">Client billing</p><p className="text-xs text-cream-faint">Packages and plans</p></Link></div>

        {/* Headline: total monthly revenue */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-widest text-cream-faint">
              Total Revenue · {monthName}
            </div>
            <div className="tabular text-5xl font-bold text-sky mt-1" style={{ fontFamily: "var(--font-display)" }}>
              {formatCurrency(f.totalMonthlyRevenueCents)}
            </div>
            <div className="text-sm text-cream-faint mt-1">
              Recurring {formatCurrency(f.recurringMonthlyCents)} + delivered
              packages {formatCurrency(f.packageEarnedThisMonthCents)}
            </div>
          </CardContent>
        </Card>

        {/* Recurring breakdown */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Membership MRR" value={formatCurrency(f.membershipMrrCents)} hint="active subscriptions" />
          <Stat label="Renter Rent" value={formatCurrency(f.renterRentCents)} hint="fixed monthly" />
          <Stat label="Recurring Total" value={formatCurrency(f.recurringMonthlyCents)} hint="memberships + rent" />
          <Stat label="Packages Sold" value={formatCurrency(f.packageBookedThisMonthCents)} hint={`booked in ${monthName}`} />
        </div>

        {/* Package revenue: weekly vs monthly (earned) */}
        <Card>
          <CardHeader>
            <CardTitle>Package revenue (delivered)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-cream-faint">This week</div>
              <div className="tabular text-3xl font-bold text-sky mt-1" style={{ fontFamily: "var(--font-display)" }}>
                {formatCurrency(f.packageEarnedThisWeekCents)}
              </div>
              <div className="text-xs text-cream-faint mt-1">{f.sessionsThisWeek} sessions completed</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-cream-faint">This month</div>
              <div className="tabular text-3xl font-bold text-sky mt-1" style={{ fontFamily: "var(--font-display)" }}>
                {formatCurrency(f.packageEarnedThisMonthCents)}
              </div>
              <div className="text-xs text-cream-faint mt-1">{f.sessionsThisMonth} sessions completed</div>
            </div>
          </CardContent>
        </Card>

        {/* Per-trainer session volume */}
        {f.sessionsByTrainer.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sessions by trainer · {monthName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {f.sessionsByTrainer.map((t) => (
                <div
                  key={t.trainer_id}
                  className="flex items-center justify-between border-b border-divider/50 pb-2 last:border-0"
                >
                  <span className="text-sm text-cream">{t.name}</span>
                  <span className="text-sm font-medium text-cream">
                    {t.count} sessions
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card><CardHeader><CardTitle>Recent payments</CardTitle></CardHeader><CardContent className="p-0">{!recentPayments?.length ? <p className="px-5 pb-5 text-sm text-cream-faint">No Coach OS payments recorded yet.</p> : <div className="divide-y divide-divider">{recentPayments.map((p:any) => <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-cream">{paymentNames.get(p.client_id) ?? "Client"}</p><p className="truncate text-xs text-cream-faint">{p.description || "IMS payment"} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "Pending"}</p></div><div className="text-right"><p className="text-sm font-semibold tabular text-cream">{formatCurrency(Number(p.amount_cents || 0))}</p><p className={`text-[11px] capitalize ${p.status === "failed" ? "text-red-600" : "text-cream-faint"}`}>{p.status}</p></div></div>)}</div>}</CardContent></Card>

        <RentersPanel renters={rentersList ?? []} />

        <p className="text-xs text-cream-faint">
          &quot;Delivered&quot; package revenue recognizes a package&apos;s per-session value as
          each session is completed. &quot;Packages sold&quot; is cash booked when a
          package is purchased. Recurring = memberships + renter rent.
        </p>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-widest text-cream-faint">{label}</div>
        <div className="tabular text-2xl font-bold text-sky mt-1" style={{ fontFamily: "var(--font-display)" }}>{value}</div>
        {hint && <div className="text-[11px] text-cream-faint mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}
