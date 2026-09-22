import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Staff-only program edits; caller-scoped RLS is the authorization boundary. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles")
    .select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase.from("programs")
    .select("id,status,data,coach_edits,updated_at").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to load program" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160) {
      return NextResponse.json({ error: "Invalid program name" }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.data !== undefined) {
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      return NextResponse.json({ error: "Invalid program data" }, { status: 400 });
    }
    // Generated source, canonical PDF, version and assessment provenance are immutable
    // through this general edit route. Edits live in coach_edits until PDF regeneration.
    if (existing.data?.source === "ims_generator") {
      return NextResponse.json({ error: "Use coach edits for generated programs; regenerate the PDF before publishing changes" }, { status: 400 });
    }
    update.data = body.data;
  }
  if (body.coach_edits !== undefined) {
    if (!body.coach_edits || typeof body.coach_edits !== "object" || Array.isArray(body.coach_edits)
        || JSON.stringify(body.coach_edits).length > 100_000) {
      return NextResponse.json({ error: "Invalid coach edits" }, { status: 400 });
    }
    update.coach_edits = body.coach_edits;
  }
  if (body.status !== undefined) {
    const transitions: Record<string, string[]> = {
      draft: ["published", "archived"],
      published: ["active", "archived"],
      active: ["completed", "archived"],
      completed: ["archived"],
      archived: [],
    };
    if (typeof body.status !== "string" || !transitions[existing.status]?.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    }
    if (["published", "active"].includes(body.status) && existing.data?.source === "ims_generator") {
      if (existing.data?.pdf_mode === "coach") {
        return NextResponse.json({ error: "Coach-only PDF cannot be published to clients" }, { status: 400 });
      }
      if (existing.coach_edits && Object.keys(existing.coach_edits).length > 0) {
        return NextResponse.json({ error: "Regenerate the PDF to include coach edits before publishing" }, { status: 409 });
      }
      if (!existing.data?.structured_program || !existing.data?.pdf_base64) {
        return NextResponse.json({ error: "Incomplete generated program" }, { status: 409 });
      }
    }
    update.status = body.status;
    if (body.status === "published") update.published_at = new Date().toISOString();
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();
  // Optimistic concurrency: do not overwrite edits or status changed in another tab.
  const { data: saved, error } = await supabase.from("programs").update(update)
    .eq("id", id).eq("updated_at", existing.updated_at).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to save program" }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Program changed since you opened it; refresh and retry" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
