import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Decision = "approved" | "rejected";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role === "client") return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !["activforce", "voltra"].includes(body.device) ||
      !Number.isSafeInteger(body.index) || body.index < 0 ||
      !["approved", "rejected"].includes(body.decision) ||
      typeof body.expected_recorded_at !== "string")
    return NextResponse.json({ error: "Invalid review request" }, { status: 400 });
  const { data: assessment, error: readError } = await supabase.from("assessments")
    .select("data, updated_at").eq("id", id).maybeSingle();
  if (readError || !assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const data = assessment.data && typeof assessment.data === "object" && !Array.isArray(assessment.data)
    ? assessment.data as Record<string, unknown> : {};
  const key = body.device === "activforce" ? "device_measurements" : "voltra_sessions";
  const items = data[key];
  if (!Array.isArray(items) || !items[body.index] ||
      items[body.index].recorded_at !== body.expected_recorded_at)
    return NextResponse.json({ error: "Reading changed. Reload before reviewing." }, { status: 409 });
  const next = items.map((item, index) => index === body.index ? {
    ...item, review_status: body.decision as Decision, reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  } : item);
  const { data: saved, error } = await supabase.from("assessments")
    .update({ data: { ...data, [key]: next }, updated_at: new Date().toISOString() })
    .eq("id", id).eq("updated_at", assessment.updated_at).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save review" }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Assessment changed. Reload and retry." }, { status: 409 });
  return NextResponse.json({ saved: true, decision: body.decision });
}
