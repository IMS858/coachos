import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { OwnerDashboard } from "@/components/dashboard/owner-dashboard";
import { TrainerDashboard } from "@/components/dashboard/trainer-dashboard";
import { ClientDashboard } from "@/components/dashboard/client-dashboard";
import type { UserRole } from "@/lib/types/database";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const params = await searchParams;
  const role = profile.role as UserRole;

  // Owners can switch between owner overview and trainer "today" view
  // via ?view=trainer — for when Jason is actually running sessions.
  const view =
    role === "owner" && params.view === "trainer" ? "trainer" : role;

  return (
    <AppShell>
      {view === "owner" && (
        <OwnerDashboard fullName={profile.full_name} />
      )}
      {view === "trainer" && (
        <TrainerDashboard fullName={profile.full_name} />
      )}
      {view === "client" && (
        <ClientDashboard fullName={profile.full_name} />
      )}
    </AppShell>
  );
}
