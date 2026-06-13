import {
  DollarSign,
  Users,
  TrendingUp,
  UserPlus,
  AlertCircle,
  Activity,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StudioHero } from "@/components/dashboard/studio-hero";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { findLowBalancePackages } from "@/lib/queries/low-balance";

/**
 * Owner Dashboard.
 * MRR sums plans.monthly_rate_cents (not the deprecated memberships table).
 * At-risk now works correctly because clients.last_session_at is auto-updated
 * by a trigger on session completion.
 */
export async function OwnerDashboard({ fullName }: { fullName: string }) {
  const firstName = fullName.split(" ")[0];
  const supabase = await createClient();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: summary },
    { count: leadsThisMonth },
    { count: assessmentsCompletedThisMonth },
    { count: convertedThisMonth },
    { data: pipelineRows },
    { data: roster },
    { count: clientsAt90 },
    { count: stillActiveAt90 },
  ] = await Promise.all([
    // The summary view gives us MRR, plan counts, last session per client
    supabase
      .from("client_billing_summary")
      .select("client_id, full_name, status, billing_type, total_monthly_cents, active_subscriptions_count, active_packages_count, last_session_at, primary_plan_label"),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("status", "lead")
      .gte("created_at", startOfMonth),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("status", "assessment_completed")
      .gte("updated_at", startOfMonth),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .gte("joined_at", startOfMonth),
    supabase
      .from("clients")
      .select("status")
      .in("status", ["lead", "assessment_booked", "assessment_completed", "active"]),
    supabase
      .from("client_billing_summary")
      .select("client_id, full_name, status, primary_plan_label")
      .order("full_name", { ascending: true })
      .limit(8),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .lte("joined_at", ninetyDaysAgo),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .lte("joined_at", ninetyDaysAgo)
      .eq("status", "active"),
  ]);

  const allClients = summary ?? [];
  const activeClients = allClients.filter((c: any) => c.status === "active");

  // MRR: sum total_monthly_cents across active clients
  const mrr = activeClients.reduce(
    (sum: number, c: any) => sum + (c.total_monthly_cents ?? 0),
    0
  );

  // At-risk: active clients whose last_session_at is null or > 14 days ago
  const atRisk = activeClients
    .filter((c: any) => {
      if (!c.last_session_at) return true;
      return new Date(c.last_session_at) < new Date(fourteenDaysAgo);
    })
    .slice(0, 5)
    .map((c: any) => ({
      id: c.client_id,
      name: c.full_name,
      lastSeen: c.last_session_at,
    }));

  const conversionRate =
    assessmentsCompletedThisMonth && assessmentsCompletedThisMonth > 0
      ? Math.round(((convertedThisMonth ?? 0) / assessmentsCompletedThisMonth) * 100)
      : null;

  // Packages at or below 2 sessions remaining — renewal/upsell signal
  const lowBalance = await findLowBalancePackages(2);

  const retention90 =
    clientsAt90 && clientsAt90 > 0
      ? Math.round(((stillActiveAt90 ?? 0) / clientsAt90) * 100)
      : null;

  const pipeline = ["lead", "assessment_booked", "assessment_completed", "active"].map((s) => ({
    stage:
      s === "lead" ? "New leads"
      : s === "assessment_booked" ? "Assessment booked"
      : s === "assessment_completed" ? "Assessment completed"
      : "Active members",
    count: (pipelineRows ?? []).filter((c: any) => c.status === s).length,
    color:
      s === "lead" ? "bg-cream-faint"
      : s === "assessment_booked" ? "bg-sky/60"
      : s === "assessment_completed" ? "bg-sky/80"
      : "bg-status-optimal",
  }));
  const maxPipelineCount = Math.max(...pipeline.map((p) => p.count), 1);

  // Time-aware greeting (Pacific — IMS is in San Diego)
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Los_Angeles",
    }).format(new Date())
  );
  const timeOfDay =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col gap-6">
      <StudioHero
        greeting={`${timeOfDay}, ${firstName}`}
        subline="Here's how IMS is doing today."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="MRR"
          value={mrr > 0 ? formatCurrency(mrr) : "—"}
          icon={DollarSign}
          hint={mrr === 0 ? "no active subs yet" : `${activeClients.length} active`}
        />
        <KpiCard
          label="Active"
          value={String(activeClients.length)}
          icon={Users}
          hint="status = active"
        />
        <KpiCard
          label="New Leads"
          value={String(leadsThisMonth ?? 0)}
          icon={UserPlus}
          hint="this month"
        />
        <KpiCard
          label="Conversion"
          value={conversionRate !== null ? `${conversionRate}%` : "—"}
          icon={TrendingUp}
          hint={conversionRate !== null ? "assess → member" : "needs more data"}
        />
        <KpiCard
          label="90-day Retention"
          value={retention90 !== null ? `${retention90}%` : "—"}
          icon={Activity}
          hint={retention90 !== null ? `${stillActiveAt90}/${clientsAt90}` : "needs more data"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Lead → assessment → member funnel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pipeline.map((stage) => (
                <div key={stage.stage} className="flex items-center gap-4">
                  <div className="w-44 shrink-0 text-sm text-cream-dim">
                    {stage.stage}
                  </div>
                  <div className="flex-1 bg-navy-deep rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full ${stage.color} transition-all`}
                      style={{
                        width: `${(stage.count / maxPipelineCount) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="w-10 text-right text-sm font-medium">
                    {stage.count}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-status-limited" />
              At Risk
            </CardTitle>
            <CardDescription>14+ days no session</CardDescription>
          </CardHeader>
          <CardContent>
            {atRisk.length > 0 ? (
              <ul className="space-y-3">
                {atRisk.map((c: any) => {
                  const daysOut = c.lastSeen
                    ? Math.round(
                        (Date.now() - new Date(c.lastSeen).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    : null;
                  return (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium text-cream truncate hover:text-sky-light"
                      >
                        {c.name}
                      </Link>
                      <Badge tone="limited">
                        {daysOut !== null ? `${daysOut}d` : "never"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-cream-faint italic">
                Everyone's been seen recently. Nice.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-status-moderate" />
              Low Balance
            </CardTitle>
            <CardDescription>
              Packages with 2 or fewer sessions left — time to renew
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lowBalance.length > 0 ? (
              <ul className="space-y-2.5">
                {lowBalance.slice(0, 6).map((c) => (
                  <li
                    key={c.clientId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <Link
                      href={`/clients/${c.clientId}`}
                      className="font-medium text-cream truncate hover:text-sky-light"
                    >
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-cream-faint">
                        {c.planLabel}
                      </span>
                      <Badge tone={c.state === "depleted" ? "limited" : "moderate"}>
                        {c.state === "depleted"
                          ? "Depleted"
                          : `${c.remaining} left`}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-cream-faint italic">
                No packages running low. All topped up.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Roster</CardTitle>
              <CardDescription>{allClients.length} total clients</CardDescription>
            </div>
            <Link
              href="/clients"
              className="text-xs text-sky-light hover:text-sky flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {roster && roster.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
                {roster.map((c: any) => (
                  <Link
                    key={c.client_id}
                    href={`/clients/${c.client_id}`}
                    className="flex items-center justify-between text-sm hover:bg-navy-elev rounded-md px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <span className="text-cream truncate">{c.full_name}</span>
                    <span className="text-xs text-cream-faint truncate ml-2">
                      {c.primary_plan_label ?? "—"}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-cream-faint italic">No clients yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
