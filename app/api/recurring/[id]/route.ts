import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE /api/recurring/[id] — cancel a standing booking.
 * Marks the series cancelled and deletes its FUTURE, still-scheduled sessions
 * (past and completed sessions are left untouched for history).
 */
export async function DELETE(
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
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const svc = createServiceClient();
  const nowIso = new Date().toISOString();

  // Remove future scheduled sessions for this series (keep completed/past).
  await svc
    .from("sessions")
    .delete()
    .eq("recurring_series_id", id)
    .gte("scheduled_at", nowIso)
    .eq("status", "scheduled");

  const { error } = await svc
    .from("recurring_series")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Could not cancel", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
