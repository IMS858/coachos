import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialSnapshot } from "@/lib/queries/financials";
import { RentersPanel } from "@/components/financials/renters-panel";
import { formatCurrency } from "@/lib/utils";

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

  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "America/Los_Angeles",
  }).format(new Date());

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Financials</h1>
          <p className="text-cream-faint text-sm">
            Your full revenue picture — recurring income plus delivered package
            revenue.
          </p>
        </div>

        {/* Headline: total monthly revenue */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-widest text-cream-faint">
              Total Revenue · {monthName}
            </div>
            <div className="text-4xl font-semibold text-cream mt-1">
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
              <div className="text-2xl font-semibold text-cream mt-1">
                {formatCurrency(f.packageEarnedThisWeekCents)}
              </div>
              <div className="text-xs text-cream-faint mt-1">{f.sessionsThisWeek} sessions completed</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-cream-faint">This month</div>
              <div className="text-2xl font-semibold text-cream mt-1">
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

        <RentersPanel renters={rentersList ?? []} />

        <p className="text-xs text-cream-faint">
          "Delivered" package revenue recognizes a package's per-session value as
          each session is completed. "Packages sold" is cash booked when a
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
        <div className="text-xl font-semibold text-cream mt-1">{value}</div>
        {hint && <div className="text-[11px] text-cream-faint mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}
