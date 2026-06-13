import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { AssessmentWizard } from "@/components/assessments/assessment-wizard";

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!viewer || viewer.role === "client") redirect("/dashboard");

  const params = await searchParams;

  // Clients for the picker (any non-churned client)
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, status")
    .neq("status", "churned");
  const ids = (clientRows ?? []).map((c) => c.id);
  let clients: { id: string; full_name: string }[] = [];
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids)
      .order("full_name");
    clients = profs ?? [];
  }

  const preselected = params.client_id
    ? clients.find((c) => c.id === params.client_id)
    : undefined;

  return (
    <AppShell>
      <div className="flex flex-col gap-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link
            href="/assessments"
            className="text-cream-faint hover:text-cream transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            New assessment
          </h1>
        </div>

        <AssessmentWizard
          clients={clients}
          clientId={preselected?.id}
          clientName={preselected?.full_name}
        />
      </div>
    </AppShell>
  );
}
