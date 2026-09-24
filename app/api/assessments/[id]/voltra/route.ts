import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeVoltraCSV } from "@/lib/devices/voltra-csv";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role === "client") return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.csv !== "string") return NextResponse.json({ error: "CSV required" }, { status: 400 });
  const required = ["exercise", "session_date", "side", "training_mode"] as const;
  for (const field of required) {
    if (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 150)
      return NextResponse.json({ error: "Invalid " + field }, { status: 400 });
  }
  if (!["left", "right", "bilateral", "unspecified"].includes(body.side))
    return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.session_date) || Number.isNaN(Date.parse(body.session_date)))
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  let summary;
  try { summary = summarizeVoltraCSV(body.csv); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid CSV" }, { status: 400 }); }
  const { data: assessment, error: readError } = await supabase.from("assessments")
    .select("id").eq("id", id).maybeSingle();
  if (readError || !assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const { data: evidence, error: evidenceError } = await supabase.from("assessment_device_evidence")
    .select("voltra_sessions,updated_at").eq("assessment_id",id).maybeSingle();
  if (evidenceError) return NextResponse.json({ error: "Could not load private workouts" }, { status: 500 });
  const existing = Array.isArray(evidence?.voltra_sessions) ? evidence.voltra_sessions : [];
  if (existing.length >= 30) return NextResponse.json({ error: "Workout limit reached" }, { status: 400 });
  const session = { ...summary, exercise: body.exercise.trim(), session_date: body.session_date,
    side: body.side, training_mode: body.training_mode.trim(),
    recorded_by: user.id, recorded_at: new Date().toISOString() };
  const now = new Date().toISOString();
  const query = evidence ? supabase.from("assessment_device_evidence")
    .update({ voltra_sessions:[...existing,session], updated_at:now })
    .eq("assessment_id",id).eq("updated_at",evidence.updated_at)
    : supabase.from("assessment_device_evidence").insert({ assessment_id:id,voltra_sessions:[session] });
  const { data: saved, error } = await query.select("assessment_id").maybeSingle();
  if (error || !saved) return NextResponse.json({ error: error ? "Could not save workout" : "Workouts changed; reload and retry" }, { status: error ? 500 : 409 });
  return NextResponse.json({ session });
}
