import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assessWaivers, outstandingRequired } from "@/lib/waivers";
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

  // Waiver gate. A lapsed liability waiver is a real exposure, so a client with
  // an outstanding REQUIRED agreement is sent to sign before anything else.
  // Optional documents (photo release, telehealth) never block — declining
  // those is a legitimate choice, not an outstanding task.
  if (role === "client") {
    const svc = createServiceClient();
  
  // Massage consent only applies to clients who actually receive bodywork, and
  // minor consent only under 18 — derived rather than assumed.
  const { data: clientRow } = await svc
    .from("clients")
    .select("date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  const { data: massagePlans } = await svc
    .from("plans")
    .select("id")
    .eq("client_id", user.id)
    .eq("service_type", "massage")
    .limit(1);
  const dob = (clientRow as any)?.date_of_birth;
  const isMinor = dob
    ? (Date.now() - new Date(dob).getTime()) / 31557600000 < 18
    : false;
  const receivesMassage = ((massagePlans ?? []) as any[]).length > 0;

  const { data: waiverRows } = await svc
      .from("waivers")
      .select("waiver_type, waiver_version, signed_at")
      .eq("client_id", user.id);
    if (outstandingRequired(assessWaivers((waiverRows ?? []) as any, { receivesMassage, isMinor })).length > 0) {
      redirect("/waivers");
    }
  }

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
