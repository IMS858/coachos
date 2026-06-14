import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, User as UserIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { SessionDetail } from "@/components/sessions/session-detail";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (viewerProfile?.role === "client") redirect("/dashboard");

  // Pull the session with related data
  const { data: session } = await supabase
    .from("sessions")
    .select(
      `id, scheduled_at, duration_minutes, session_type, service_type, status,
       notes_pre, notes_post, completed_at, plan_id,
       client_id, trainer_id,
       client:profiles!sessions_client_id_fkey(full_name, email, phone),
       trainer:profiles!sessions_trainer_id_fkey(full_name)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();

  // Pull client's active plans so we know what's available to bill against
  const { data: activePlans } = await supabase
    .from("plans")
    .select("id, kind, tier, service_type, custom_label, current_session_number, total_sessions, status")
    .eq("client_id", session.client_id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Today
        </Link>

        <SessionDetail
          session={session as any}
          activePlans={activePlans ?? []}
        />
      </div>
    </AppShell>
  );
}
