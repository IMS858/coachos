import Link from "next/link";
import { Dumbbell, ChevronRight, Sparkles } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  draft: "moderate",
  published: "optimal",
  active: "optimal",
};

/**
 * On the client profile: shows the client's training program(s) with a link to
 * open and edit each. If none exist, points to the latest assessment to
 * generate one.
 */
export async function ClientProgramLink({ clientId }: { clientId: string }) {
  const svc = createServiceClient();

  const { data: programs } = await svc
    .from("programs")
    .select("id, name, status, weeks, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  const { data: lastAssessment } = await svc
    .from("assessments")
    .select("id")
    .eq("client_id", clientId)
    .order("assessment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-sky" />
          Training Program
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {programs && programs.length > 0 ? (
          <div className="divide-y divide-divider">
            {programs.map((p) => (
              <Link
                key={p.id}
                href={`/programs/${p.id}`}
                className="flex items-center justify-between px-6 py-3 hover:bg-navy-elev transition-colors"
              >
                <div>
                  <div className="text-sm text-cream">{p.name}</div>
                  <div className="text-xs text-cream-faint">
                    {p.weeks}-week program · tap to edit
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                  <ChevronRight className="h-4 w-4 text-cream-faint" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-6 text-center">
            <p className="text-sm text-cream-faint mb-3">
              No program yet for this client.
            </p>
            {lastAssessment ? (
              <Link
                href={`/assessments/${lastAssessment.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-sky hover:underline"
              >
                <Sparkles className="h-4 w-4" /> Generate from their assessment
              </Link>
            ) : (
              <p className="text-xs text-cream-faint">
                Complete an assessment first, then generate a program.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
