import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Candidate discovery only. This endpoint never declares an exercise safe. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "trainer"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("exercise_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid exercise" }, { status: 400 });
  const { data: source } = await supabase.from("exercises").select("id,movement_pattern,primary_joints").eq("id", id).maybeSingle();
  if (!source || !source.movement_pattern) return NextResponse.json({ candidates: [], requires_coach_review: true });
  const { data: reviewed } = await supabase.from("exercise_reviews").select("exercise_id")
    .eq("safety_status", "approved").in("mapping_status", ["exact_normalized", "coach_confirmed"]).limit(500);
  const ids = (reviewed ?? []).map(r => r.exercise_id).filter(x => x !== id);
  if (!ids.length) return NextResponse.json({ candidates: [], requires_coach_review: true });
  const { data: candidates } = await supabase.from("exercises")
    .select("id,name,ims_label,movement_pattern,primary_joints,equipment,level")
    .in("id", ids).eq("movement_pattern", source.movement_pattern).limit(30);
  return NextResponse.json({
    candidates: candidates ?? [],
    requires_coach_review: true,
    disclaimer: "These are identity-reviewed exercises sharing a movement pattern, not cleared substitutions. Check each client's restrictions, loading, range and program context.",
  });
}
