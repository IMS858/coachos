import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { ClientEditor } from "@/components/clients/client-editor";
import { SessionTracker } from "@/components/clients/session-tracker";
import { ClientProgressReport } from "@/components/clients/client-progress-report";
import { IntakeLinkButton } from "@/components/clients/intake-link-button";

export default async function ClientProfilePage({
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (!profileRow) notFound();

  // Load all plans (active + history)
  const { data: plans } = await supabase
    .from("plans")
    .select("*")
    .eq("client_id", id)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/clients"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          All clients
        </Link>

        <ClientEditor
          clientId={id}
          initialProfile={profileRow}
          initialPlans={plans ?? []}
        />

        <SessionTracker clientId={id} />

        <ClientProgressReport clientId={id} clientName={profileRow.full_name} />

        <IntakeLinkButton
          clientId={id}
          clientName={profileRow.full_name}
          clientEmail={profileRow.email}
        />
      </div>
    </AppShell>
  );
}
