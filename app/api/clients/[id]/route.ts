import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/clients/[id]
 *
 * Profile-only updates now (name/email/phone/notes).
 * Plans are managed via /api/clients/[id]/plans (POST) and /api/plans/[id] (PATCH/DELETE).
 *
 * Body shapes:
 *   { kind: 'profile', full_name, email, phone }
 *   { kind: 'status', status: 'active' | 'lead' | 'paused' | 'churned' }
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
  const kind = body.kind;

  if (kind === "profile") {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: body.full_name,
        email: body.email,
        phone: body.phone || null,
        ...(body.avatar_url !== undefined
          ? { avatar_url: body.avatar_url || null }
          : {}),
      })
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "Profile save failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === "status") {
    const allowed = ["active", "lead", "paused", "churned", "assessment_booked", "assessment_completed"];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const { error } = await supabase
      .from("clients")
      .update({ status: body.status })
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "Status update failed", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
