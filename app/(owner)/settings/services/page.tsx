import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { AddServiceButton } from "@/components/services/add-service-button";
import { ServiceCard } from "@/components/services/service-card";

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
              Your offerings — training, gym, recovery. Add a photo and
              highlights for each. Toggle visibility for clients.
            </p>
          </div>
          <AddServiceButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {(services ?? []).map((s: any) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>

        {(!services || services.length === 0) && (
          <div className="px-6 py-12 text-center text-sm text-cream-faint border border-divider rounded-xl">
            No services yet. Run migration 0014 to seed Training, Gym, Sauna, and
            Recovery Room — then add photos.
          </div>
        )}

        <div className="rounded-lg border border-divider bg-navy-soft/50 p-4 text-sm text-cream-faint">
          <strong className="text-cream-dim">Tip:</strong> Click a card to edit
          its name, photo, tagline, and highlights. The eye toggle controls
          whether clients see it.
        </div>
      </div>
    </AppShell>
  );
}
