import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, "neutral" | "moderate" | "optimal"> = {
  draft: "neutral",
  in_progress: "moderate",
  complete: "optimal",
};

export default async function AssessmentsPage() {
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

  const { data: rows } = await supabase
    .from("assessments")
    .select("id, client_id, trainer_id, assessment_date, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  const assessments = rows ?? [];

  // Resolve names (clients + trainers) in one query
  const ids = Array.from(
    new Set(assessments.flatMap((a) => [a.client_id, a.trainer_id]))
  );
  let names: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
  }

  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${d}T00:00:00Z`));

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Assessments
            </h1>
            <p className="text-sm text-cream-dim mt-1">
              The IMS assessment wizard — every client starts here.
            </p>
          </div>
          <Link href="/assessments/new">
            <Button>
              <Plus className="h-4 w-4" />
              New assessment
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-divider">
              {assessments.length === 0 && (
                <div className="px-6 py-16 flex flex-col items-center gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30">
                    <ClipboardList className="h-6 w-6 text-violet-300" />
                  </div>
                  <p className="text-cream font-medium">
                    No assessments yet.
                  </p>
                  <p className="text-sm text-cream-faint max-w-sm">
                    Run your first one — goals, health history, movement
                    screen, strength baseline, and your recommendation, all
                    saved as you go.
                  </p>
                  <Link href="/assessments/new" className="mt-1">
                    <Button>
                      <Plus className="h-4 w-4" />
                      Start an assessment
                    </Button>
                  </Link>
                </div>
              )}
              {assessments.map((a) => (
                <Link
                  key={a.id}
                  href={`/assessments/${a.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-navy-elev transition-colors"
                >
                  <Avatar name={names[a.client_id] ?? "?"} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-cream truncate">
                      {names[a.client_id] ?? "Client"}
                    </div>
                    <div className="text-xs text-cream-faint mt-0.5">
                      {fmt(a.assessment_date)} · by{" "}
                      {names[a.trainer_id]?.split(" ")[0] ?? "—"}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                    {a.status.replace("_", " ")}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-cream-faint shrink-0" />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
