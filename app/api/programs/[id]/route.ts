import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH /api/programs/[id]
 * Saves edits to a generated program (data jsonb) and/or status/name.
 * Owner + trainer only.
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.data !== undefined) update.data = body.data;
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.status === "string") {
    const allowed = ["draft", "published", "active", "completed", "archived"];
    if (allowed.includes(body.status)) {
      update.status = body.status;
      if (body.status === "published" || body.status === "active") {
        update.published_at = new Date().toISOString();
      }
    }
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("programs").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
