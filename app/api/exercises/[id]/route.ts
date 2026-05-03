import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/exercises/[id]
 *
 * Update an exercise. Trainer/owner only.
 *
 * Allow-listed fields: most editable fields. Slug/id immutable.
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
  const editableFields = [
    "name", "ims_label",
    "category", "movement_pattern", "level",
    "primary_joints", "primary_muscles", "equipment",
    "coaching_cues", "common_mistakes",
    "programming_notes", "contraindications",
    "load_descriptors", "system_tags", "tags",
    "regression_ids", "progression_ids",
    "video_provider", "video_id", "video_url", "thumbnail_url",
    "status", "client_visible",
  ];
  for (const field of editableFields) {
    if (body[field] !== undefined) {
      allowed[field] = body[field];
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase.from("exercises").update(allowed).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "Update failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
