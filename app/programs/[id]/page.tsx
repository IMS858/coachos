import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GripVertical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgramExercises } from "@/components/programs/program-exercises";
import { EditableProgram } from "@/components/programs/editable-program";

const BLOCK_ORDER = ["warmup", "main", "finisher", "cooldown"] as const;

export default async function ProgramPage({
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
  const isStaff =
    viewerProfile?.role === "trainer" || viewerProfile?.role === "owner";

  const { data: program } = await supabase
    .from("programs")
    .select(
      `id, name, status, notes, data,
       clients!inner(id, profiles!inner(full_name))`
    )
    .eq("id", id)
    .maybeSingle();

  if (!program) notFound();

  const generated = (program as any).data;
  const hasGenerated =
    generated &&
    Array.isArray(generated.weekly_structure) &&
    generated.weekly_structure.length > 0;

  const { data: assignments } = await supabase
    .from("program_exercises")
    .select(
      `id, block, sort_order, sets, reps, load, rest_seconds, tempo, duration_seconds,
       notes_trainer, notes_client,
       exercises!inner(id, name, ims_label, slug, category, movement_pattern,
                       coaching_cues, video_id, video_provider, primary_joints)`
    )
    .eq("program_id", id)
    .order("block")
    .order("sort_order");

  const grouped = BLOCK_ORDER.map((block) => ({
    block,
    items: (assignments ?? []).filter((a: any) => a.block === block),
  }));

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-cream-dim hover:text-cream w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight">
                {(program as any).name}
              </h1>
              <Badge tone={statusTone((program as any).status)}>
                {(program as any).status}
              </Badge>
            </div>
            <p className="text-sm text-cream-dim mt-1">
              {(program as any).clients?.profiles?.full_name ?? "—"}
            </p>
          </div>
        </div>

        {/* AI-generated program — editable for staff, read-only for clients */}
        {hasGenerated && isStaff && (
          <EditableProgram
            programId={id}
            initialData={generated}
            initialStatus={(program as any).status}
          />
        )}

        {hasGenerated && !isStaff && (
          <div className="flex flex-col gap-5">
            {generated.summary && (
              <div className="rounded-xl border border-sky/30 bg-sky/5 p-4">
                <p className="text-sm text-cream">{generated.summary}</p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-cream-faint">
                  {generated.focus && <span>Focus: {generated.focus}</span>}
                  {generated.sessions_per_week && (
                    <span>{generated.sessions_per_week}×/week</span>
                  )}
                  {generated.weeks && <span>{generated.weeks} weeks</span>}
                </div>
              </div>
            )}

            {generated.weekly_structure.map((day: any, di: number) => (
              <Card key={di}>
                <CardHeader>
                  <CardTitle className="text-base">{day.day_label}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {(day.blocks ?? []).map((blk: any, bi: number) => (
                    <div key={bi}>
                      <div className="text-xs uppercase tracking-widest text-sky mb-2">
                        {blk.block}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {(blk.exercises ?? []).map((ex: any, ei: number) => (
                          <div
                            key={ei}
                            className="flex items-baseline justify-between gap-3 border-b border-divider/40 pb-1.5 last:border-0"
                          >
                            <div className="min-w-0">
                              <span className="text-sm text-cream">{ex.name}</span>
                              {ex.notes && (
                                <span className="text-xs text-cream-faint block">
                                  {ex.notes}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-cream-dim shrink-0 whitespace-nowrap">
                              {[ex.sets && `${ex.sets}×`, ex.reps]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {(generated.progression_notes || generated.coach_cautions) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Coach Notes</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm text-cream-dim">
                  {generated.progression_notes && (
                    <div>
                      <span className="text-cream font-medium">Progression: </span>
                      {generated.progression_notes}
                    </div>
                  )}
                  {generated.coach_cautions && (
                    <div>
                      <span className="text-cream font-medium">Cautions: </span>
                      {generated.coach_cautions}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {isStaff && !hasGenerated && (
          <div className="rounded-md border border-divider bg-navy-deep px-4 py-3 text-sm text-cream-dim">
            Add exercises from the{" "}
            <Link
              href="/library"
              className="text-sky-light hover:text-sky underline underline-offset-2"
            >
              Library
            </Link>{" "}
            — click any exercise, then "Add to program".
          </div>
        )}

        {!hasGenerated && (
          <ProgramExercises programId={id} grouped={grouped} isStaff={isStaff} />
        )}
      </div>
    </AppShell>
  );
}

function statusTone(s: string): any {
  switch (s) {
    case "active":
    case "published":
      return "optimal";
    case "draft":
      return "moderate";
    case "archived":
      return "neutral";
    default:
      return "neutral";
  }
}
