import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GripVertical, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgramExercises } from "@/components/programs/program-exercises";

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
      `id, name, status, notes,
       clients!inner(id, profiles!inner(full_name))`
    )
    .eq("id", id)
    .maybeSingle();

  if (!program) notFound();

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

        {isStaff && (
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

        <ProgramExercises programId={id} grouped={grouped} isStaff={isStaff} />
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
