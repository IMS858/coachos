import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { NewSessionForm } from "@/components/sessions/new-session-form";

// Always fetch a live client list — a client created moments ago must appear
// in the picker immediately, so this page can't be statically cached.
export const dynamic = "force-dynamic";

/**
 * /sessions/new — schedule a future session, or log one already completed.
 *
 * URL params:
 *   ?mode=schedule (default) or ?mode=log
 *   ?client_id=<uuid> pre-selects a client
 *
 * Loads all active clients with their active plans so the form can show
 * "Will tick training counter from #24 → #25" inline as soon as a client is picked.
 */
export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; client_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();
  if (!viewerProfile || viewerProfile.role === "client") redirect("/dashboard");

  const params = await searchParams;
  const mode = params.mode === "log" ? "log" : "schedule";

  // Load active clients from the billing-summary view — the SAME source the
  // Clients page uses, so anyone visible there is selectable here. (The old
  // clients?profiles!inner(...) embed silently returned zero rows.)
  const { data: clientsData } = await supabase
    .from("client_billing_summary")
    .select("client_id, full_name, email, status")
    .in("status", ["active", "lead"])
    .order("full_name", { ascending: true });

  const clientIds = (clientsData ?? []).map((c: any) => c.client_id);

  // Load active plans for those clients (one batch)
  const { data: plansData } = clientIds.length > 0
    ? await supabase
        .from("plans")
        .select(
          "client_id, kind, tier, service_type, custom_label, current_session_number, monthly_rate_cents"
        )
        .in("client_id", clientIds)
        .eq("status", "active")
    : { data: [] as any[] };

  // Group plans by client
  const plansByClient: Record<string, any[]> = {};
  for (const plan of plansData ?? []) {
    if (!plansByClient[plan.client_id]) plansByClient[plan.client_id] = [];
    plansByClient[plan.client_id]!.push(plan);
  }

  // Build the client list shape the form wants
  const clients = (clientsData ?? []).map((c: any) => ({
    id: c.client_id,
    full_name: c.full_name ?? "—",
    email: c.email ?? "",
    active_plans: plansByClient[c.client_id] ?? [],
  }));

  // Load trainers
  const { data: trainersData } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["trainer", "owner"])
    .order("full_name");

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-3xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {mode === "log" ? "Log a session" : "Schedule a session"}
          </h1>
          <p className="text-sm text-cream-dim mt-1">
            {mode === "log"
              ? "Record a session that already happened. Counter ticks immediately."
              : "Book a future session. No counter change until you mark it complete."}
          </p>
        </div>

        <NewSessionForm
          initialMode={mode as "schedule" | "log"}
          initialClientId={params.client_id}
          clients={clients}
          trainers={trainersData ?? []}
          currentUserId={viewerProfile.id}
        />
      </div>
    </AppShell>
  );
}
