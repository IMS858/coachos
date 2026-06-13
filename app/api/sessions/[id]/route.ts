import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/sessions/[id]
 *
 * Update session notes (pre and/or post). Trainer/owner only.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const body = await request.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};
  if (body.notes_pre !== undefined) allowed.notes_pre = body.notes_pre;
  if (body.notes_post !== undefined) allowed.notes_post = body.notes_post;
  if (body.scheduled_at !== undefined) allowed.scheduled_at = body.scheduled_at;
  if (body.duration_minutes !== undefined) allowed.duration_minutes = body.duration_minutes;
  if (body.service_type !== undefined) allowed.service_type = body.service_type;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase.from("sessions").update(allowed).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Update failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
