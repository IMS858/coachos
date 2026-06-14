import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { LeadsView } from "@/components/leads/leads-view";

export const dynamic = "force-dynamic";

/**
 * /leads — imported prospect pipeline with copy-paste outreach templates.
 * Owner + trainer.
 */
export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/leads");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) redirect("/dashboard");

  const svc = createServiceClient();
  const { data: leads } = await svc
    .from("leads")
    .select(
      "id, full_name, email, phone, interest, stage, appointments_booked, last_visited, prior_trainer"
    )
    .neq("stage", "converted")
    .order("appointments_booked", { ascending: false })
    .order("full_name", { ascending: true });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-cream">Leads & Outreach</h1>
          <p className="text-cream-faint text-sm">
            Your prospect list with ready-to-send follow-up templates. Copy a
            message, send it from your phone or GoHighLevel, then mark the stage.
          </p>
        </div>

        <LeadsView leads={leads ?? []} />
      </div>
    </AppShell>
  );
}
