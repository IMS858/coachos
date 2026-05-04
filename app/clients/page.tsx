import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientsFilter } from "@/components/clients/clients-filter";
import { formatCurrency } from "@/lib/utils";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "client") redirect("/dashboard");

  const params = await searchParams;
  const search = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "all";

  let query = supabase
    .from("client_billing_summary")
    .select("*")
    .order("full_name", { ascending: true });

  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (search) query = query.ilike("full_name", `%${search}%`);

  const { data: rows } = await query;
  const allClients = rows ?? [];

  const totalMrr = allClients.reduce(
    (sum: number, c: any) => sum + (c.total_monthly_cents ?? 0),
    0
  );
  const counts = {
    total: allClients.length,
    active: allClients.filter((r: any) => r.status === "active").length,
    withSubscription: allClients.filter((r: any) => r.active_subscriptions_count > 0).length,
    withPackage: allClients.filter((r: any) => r.active_packages_count > 0).length,
    unconfigured: allClients.filter((r: any) => r.active_plans_count === 0).length,
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
            <p className="text-sm text-cream-dim mt-1">
              {counts.total} total · {counts.active} active ·{" "}
              {counts.withSubscription} with subscription ·{" "}
              {counts.withPackage} with packages ·{" "}
              {counts.unconfigured} unconfigured
            </p>
            <p className="text-sm text-cream-faint mt-0.5">
              Combined MRR: <span className="text-cream font-medium">{formatCurrency(totalMrr)}</span>
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4" />
            New client
          </Button>
        </div>

        <ClientsFilter initialSearch={search} initialStatus={statusFilter} />

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-divider text-left text-xs uppercase tracking-wider text-cream-faint">
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Plans</th>
                    <th className="px-6 py-3 font-medium text-right">Monthly</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Last seen</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {allClients.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-cream-faint italic"
                      >
                        {search || statusFilter !== "all"
                          ? "No clients match those filters."
                          : "No clients yet."}
                      </td>
                    </tr>
                  )}
                  {allClients.map((c: any) => (
                    <tr
                      key={c.client_id}
                      className="hover:bg-navy-elev transition-colors"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/clients/${c.client_id}`}
                          className="font-medium text-cream hover:text-sky-light"
                        >
                          {c.full_name}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <PlansCell row={c} />
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-cream">
                        {c.total_monthly_cents > 0
                          ? formatCurrency(c.total_monthly_cents)
                          : <span className="text-cream-faint">—</span>
                        }
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-3 text-xs text-cream-faint">
                        {c.last_session_at
                          ? new Date(c.last_session_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/clients/${c.client_id}`}
                          className="inline-flex items-center text-cream-faint hover:text-cream"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function PlansCell({ row }: { row: any }) {
  const subs = row.active_subscriptions_count ?? 0;
  const packs = row.active_packages_count ?? 0;

  if (subs === 0 && packs === 0) {
    return <span className="text-cream-faint italic text-xs">No active plans</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {subs > 0 && (
        <Badge tone="sky">
          {subs === 1 ? "Subscription" : `${subs} subs`}
        </Badge>
      )}
      {packs > 0 && (
        <Badge tone="optimal">
          {packs === 1 ? "1 pack" : `${packs} packs`}
        </Badge>
      )}
      {row.primary_plan_label && (
        <span className="text-xs text-cream-faint truncate">
          {row.primary_plan_label}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <Badge tone="optimal">Active</Badge>;
  if (status === "lead") return <Badge tone="moderate">Lead</Badge>;
  if (status === "paused") return <Badge tone="moderate">Paused</Badge>;
  if (status === "churned") return <Badge tone="limited">Churned</Badge>;
  return <Badge tone="neutral">{status ?? "—"}</Badge>;
}
