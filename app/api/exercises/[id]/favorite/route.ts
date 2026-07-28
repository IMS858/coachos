import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/exercises/[id]/favorite     — add to favorites
 * DELETE /api/exercises/[id]/favorite   — remove
 *
 * Per-trainer favorites. RLS enforces trainer_id = auth.uid().
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: exerciseId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent insert
  const { error } = await supabase
    .from("exercise_favorites")
    .upsert(
      { trainer_id: user.id, exercise_id: exerciseId },
      { onConflict: "trainer_id,exercise_id" }
    );
  if (error) {
    return NextResponse.json(
      { error: "Could not favorite", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: exerciseId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("exercise_favorites")
    .delete()
    .eq("trainer_id", user.id)
    .eq("exercise_id", exerciseId);

  if (error) {
    return NextResponse.json(
      { error: "Could not unfavorite", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
