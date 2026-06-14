import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  AssessmentWizard,
  emptyAssessment,
  type AssessmentData,
} from "@/components/assessments/assessment-wizard";
import { GenerateProgramButton } from "@/components/programs/generate-program-button";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  draft: "neutral",
  in_progress: "moderate",
  complete: "optimal",
};

export default async function AssessmentPage({
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

  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!viewer || viewer.role === "client") redirect("/dashboard");

  const { data: row } = await supabase
    .from("assessments")
    .select("id, client_id, status, data, section_status, assessment_date")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();

  const { data: clientProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", row.client_id)
    .maybeSingle();

  // Merge stored payload over the empty shape so new fields never crash old rows
  const base = emptyAssessment();
  const stored = (row.data ?? {}) as Partial<AssessmentData>;
  const data: AssessmentData = {
    goals: { ...base.goals, ...stored.goals },
    health: { ...base.health, ...stored.health },
    movement_screen: { ...base.movement_screen, ...stored.movement_screen },
    strength_baseline: {
      ...base.strength_baseline,
      ...stored.strength_baseline,
    },
    summary: { ...base.summary, ...stored.summary },
  };

  // Resume at the first incomplete section
  const order = [
    "goals",
    "health",
    "movement_screen",
    "strength_baseline",
    "summary",
  ];
  const sectionStatus = (row.section_status ?? {}) as Record<string, string>;
  let resumeStep = order.findIndex((k) => sectionStatus[k] !== "complete");
  if (resumeStep === -1) resumeStep = order.length - 1;

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
          <h1 className="text-2xl font-semibold tracking-tight">Assessment</h1>
          <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
            {String(row.status).replace("_", " ")}
          </Badge>
          <div className="ml-auto">
            <GenerateProgramButton assessmentId={row.id} />
          </div>
        </div>

        <AssessmentWizard
          assessmentId={row.id}
          clientId={row.client_id}
          clientName={clientProfile?.full_name ?? "Client"}
          initialData={data}
          initialSectionStatus={sectionStatus}
          initialStep={resumeStep}
        />
      </div>
    </AppShell>
  );
}
