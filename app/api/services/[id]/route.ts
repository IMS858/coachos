import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/services/[id] — update a service (owner only).
 * Accepts any subset of: name, description, duration_minutes,
 * member_included, drop_in_eligible, drop_in_price_cents, active.
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
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  const ALLOWED = [
    "name",
    "description",
    "duration_minutes",
    "member_included",
    "drop_in_eligible",
    "drop_in_price_cents",
    "active",
    "display_order",
    "image_url",
    "highlights",
    "tagline",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("service_catalog")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not update service", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ service: data });
}
