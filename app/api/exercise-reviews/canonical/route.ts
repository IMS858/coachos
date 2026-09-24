import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Explicit, attributed canonical-to-library identity confirmation. Never approves safety. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:profile} = await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if (!profile || !["owner","trainer"].includes(profile.role)) return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json().catch(()=>null);
  if (!body || typeof body.canonical_id!=="string" || !/^EX-[0-9]{4}$/.test(body.canonical_id) ||
    typeof body.exercise_id!=="string" || !/^[0-9a-f-]{36}$/i.test(body.exercise_id) ||
    typeof body.review_notes!=="string" || body.review_notes.trim().length<15 || body.review_notes.length>3000) {
    return NextResponse.json({error:"A valid canonical ID, exercise and documented mapping rationale are required"},{status:400});
  }
  const [{data:canonical},{data:exercise}] = await Promise.all([
    supabase.from("canonical_exercise_queue").select("canonical_id,canonical_name,matched_exercise_id").eq("canonical_id",body.canonical_id).maybeSingle(),
    supabase.from("exercises").select("id,name").eq("id",body.exercise_id).maybeSingle(),
  ]);
  if (!canonical || !exercise) return NextResponse.json({error:"Mapping target not found"},{status:404});
  const {data:collision} = await supabase.from("canonical_exercise_queue")
    .select("canonical_id").eq("matched_exercise_id",exercise.id).neq("canonical_id",canonical.canonical_id).maybeSingle();
  if (collision) return NextResponse.json({error:"This exercise is already mapped to a different canonical ID"},{status:409});
  const {error} = await supabase.from("canonical_exercise_queue").update({
    matched_exercise_id:exercise.id,mapping_status:"coach_confirmed",
    review_notes:body.review_notes.trim(),reviewed_by:user.id,reviewed_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  }).eq("canonical_id",canonical.canonical_id);
  if (error) return NextResponse.json({error:"Mapping could not be saved; check for an existing match"},{status:409});
  // Safety approval is deliberately a separate operation.
  return NextResponse.json({ok:true,canonical_id:canonical.canonical_id,exercise_id:exercise.id,safety_approved:false});
}
