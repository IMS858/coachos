import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/assessments/[id] — save wizard progress (staff only).
 * Body may include any of: data, section_status, status, notes, assessment_date.
 * `data` and `section_status` replace the stored jsonb wholesale — the wizard
 * always holds the full payload, which keeps the Python generator contract
 * intact (assessments.data is exactly what the engine consumes).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("data" in body) update.data = body.data;
  if ("section_status" in body) update.section_status = body.section_status;
  if ("notes" in body) update.notes = body.notes;
  if ("assessment_date" in body) update.assessment_date = body.assessment_date;
  if (
    "status" in body &&
    ["draft", "in_progress", "complete"].includes(body.status)
  ) {
    update.status = body.status;
  }

  const { data: row, error } = await supabase
    .from("assessments")
    .update(update)
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save assessment", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ assessment: row });
}
