import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const validMapping = ["unmatched", "exact_normalized", "coach_confirmed", "rejected"];
const validSafety = ["pending", "approved", "rejected"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "trainer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body.exercise_id !== "string" ||
      !validMapping.includes(body.mapping_status) || !validSafety.includes(body.safety_status) ||
      typeof body.primary_joints_confirmed !== "boolean" ||
      typeof body.contraindications_confirmed !== "boolean" ||
      typeof body.review_notes !== "string" || body.review_notes.length > 3000) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }
  const { data: exercise } = await supabase.from("exercises")
    .select("id,name,primary_joints,client_visible").eq("id", body.exercise_id).maybeSingle();
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  const approved = body.safety_status === "approved";
  if (approved && (
    !["exact_normalized", "coach_confirmed"].includes(body.mapping_status) ||
    !body.primary_joints_confirmed || !body.contraindications_confirmed ||
    !Array.isArray(exercise.primary_joints) || exercise.primary_joints.length === 0 ||
    body.review_notes.trim().length < 15
  )) {
    return NextResponse.json({ error: "Approval requires verified mapping, populated joints, both safety checks and documented rationale." }, { status: 422 });
  }
  const { error } = await supabase.from("exercise_reviews").upsert({
    exercise_id: exercise.id,
    canonical_id: typeof body.canonical_id === "string" ? body.canonical_id.slice(0, 32) : null,
    mapping_status: body.mapping_status,
    safety_status: body.safety_status,
    primary_joints_confirmed: body.primary_joints_confirmed,
    contraindications_confirmed: body.contraindications_confirmed,
    review_notes: body.review_notes.trim(),
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "exercise_id" });
  if (error) return NextResponse.json({ error: "Could not save review" }, { status: 500 });
  // Approval records are audit evidence, not automatic publication.
  return NextResponse.json({ ok: true, client_visible_unchanged: true });
}
