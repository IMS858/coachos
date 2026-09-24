import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/programs/[id]/exercises
 *
 * Assigns an exercise to a program with full prescription.
 * Trainer/owner only.
 *
 * Body:
 *   {
 *     exercise_id: string (required),
 *     block: 'warmup' | 'main' | 'finisher' | 'cooldown' (default 'main'),
 *     sets?: number,
 *     reps?: string,        // text — supports "8-12" or "30s"
 *     load?: string,
 *     rest_seconds?: number,
 *     tempo?: string,
 *     duration_seconds?: number,
 *     notes_trainer?: string,
 *     notes_client?: string,
 *   }
 *
 * position is auto-computed (max+1 within the chosen block).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: programId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (!body.exercise_id) {
    return NextResponse.json({ error: "exercise_id required" }, { status: 400 });
  }

  const block = body.block ?? "main";
  if (!["warmup", "main", "finisher", "cooldown"].includes(block)) {
    return NextResponse.json(
      { error: "block must be warmup/main/finisher/cooldown" },
      { status: 400 }
    );
  }

  // Verify the program exists (RLS gates by trainer/owner — if it returns null, they can't access it)
  const { data: program } = await supabase
    .from("programs")
    .select("id, status, trainer_id")
    .eq("id", programId)
    .maybeSingle();
  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  if (profile.role !== "owner" && program.trainer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (program.status !== "draft") {
    return NextResponse.json({ error: "Only draft programs can be edited" }, { status: 409 });
  }

  // Compute next position
  const { data: lastInBlock } = await supabase
    .from("program_exercises")
    .select("position")
    .eq("program_id", programId)
    .eq("block", block)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (lastInBlock?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("program_exercises")
    .insert({
      program_id: programId,
      exercise_id: body.exercise_id,
      block,
      position: nextSortOrder,
      sets: body.sets ?? null,
      reps: body.reps ?? null,
      load_prescription: body.load ?? null,
      rest_seconds: body.rest_seconds ?? null,
      tempo: body.tempo ?? null,
      notes: body.notes_client ?? body.notes_trainer ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not add exercise to program", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, assignment: data });
}
