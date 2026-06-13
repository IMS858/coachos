import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddServiceButton } from "@/components/services/add-service-button";
import { ServiceToggle } from "@/components/services/service-toggle";
import { formatCurrency } from "@/lib/utils";

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify owner
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "owner") redirect("/dashboard");

  // Load service catalog
  const { data: services } = await supabase
    .from("service_catalog")
    .select("*")
    .order("display_order", { ascending: true });

  return (
    <AppShell expectedRole="owner">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
            <p className="text-sm text-cream-dim mt-1">
              Recovery services and a-la-carte offerings. Edits sync to Stripe.
            </p>
          </div>
          <AddServiceButton />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recovery Catalog</CardTitle>
            <CardDescription>
              Drag to reorder · Click a row to edit · Toggle visibility for
              clients
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-divider">
              {(services ?? []).map((s: any) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-navy-elev transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-cream truncate">
                        {s.name}
                      </span>
                      {!s.active && <Badge tone="neutral">Inactive</Badge>}
                      {s.slug.startsWith("placeholder_") && (
                        <Badge tone="moderate">Placeholder</Badge>
                      )}
                    </div>
                    <div className="text-xs text-cream-faint mt-0.5">
                      {s.description ?? "—"}
                    </div>
                  </div>

                  <div className="text-right text-xs space-y-0.5 shrink-0">
                    {s.duration_minutes && (
                      <div className="text-cream-dim">{s.duration_minutes} min</div>
                    )}
                    {s.member_included && (
                      <div className="text-status-optimal">Free w/ membership</div>
                    )}
                    {s.drop_in_price_cents && (
                      <div className="text-cream-dim">
                        Drop-in: {formatCurrency(s.drop_in_price_cents)}
                      </div>
                    )}
                  </div>

                  <ServiceToggle id={s.id} active={s.active} />
                </div>
              ))}
              {(!services || services.length === 0) && (
                <div className="px-6 py-12 text-center text-sm text-cream-faint">
                  No services configured yet. Run the schema migration to seed
                  the catalog.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border border-divider bg-navy-soft/50 p-4 text-sm text-cream-faint">
          <strong className="text-cream-dim">Tip:</strong> The eye icon toggles
          whether clients can see a service. Placeholders 1-3 are seeded
          inactive — rename them via Add new service (or toggle them on) and
          they're live. Stripe sync comes with the Phase 2 billing migration.
        </div>
      </div>
    </AppShell>
  );
}
