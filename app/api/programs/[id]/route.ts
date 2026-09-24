import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isExerciseSet } from "@/lib/exercises/catalog";
import { smallJson } from "@/lib/media/request";

/** Private collections and quick drafts cannot bypass the dedicated review workflows. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me, error: profileError } = await supabase.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "Authorization unavailable" }, { status: 503 });
  if (!me || me.deleted_at || !["owner", "trainer"].includes(me.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  const body = await smallJson(request, 160000).catch(() => null) as Record<string, any> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { data: existing, error: readError } = await supabase.from("programs")
    .select("id,status,data,coach_edits,updated_at,pdf_client_url").eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to load program" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Program not found" }, { status: 404 });
  if (isExerciseSet(existing.data) || isExerciseSet(body.data)) {
    return NextResponse.json({ error: "Exercise sets are private coaching selections, not publishable programs. Edit this set in the Exercise Library." }, { status: 409 });
  }
  if (existing.data?.source === "ims_library_program" || body.data?.source === "ims_library_program") {
    return NextResponse.json({ error: "Use the private library-draft editor. Saving a prescription does not authorize client publication." }, { status: 409 });
  }
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 160) return NextResponse.json({ error: "Invalid program name" }, { status: 400 });
    update.name = body.name.trim();
  }
  if (body.data !== undefined) {
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return NextResponse.json({ error: "Invalid program data" }, { status: 400 });
    if (existing.data?.source === "ims_generator") return NextResponse.json({ error: "Use coach edits for generated programs; regenerate the PDF before publishing changes" }, { status: 400 });
    update.data = body.data;
  }
  if (body.coach_edits !== undefined && existing.status !== "draft") return NextResponse.json({ error: "Only draft programs can be edited" }, { status: 409 });
  if (body.coach_edits !== undefined) {
    if (!body.coach_edits || typeof body.coach_edits !== "object" || Array.isArray(body.coach_edits) || JSON.stringify(body.coach_edits).length > 100_000) return NextResponse.json({ error: "Invalid coach edits" }, { status: 400 });
    update.coach_edits = body.coach_edits;
  }
  if (body.status !== undefined) {
    const transitions: Record<string, string[]> = { draft: ["published", "archived"], published: ["active", "archived"], active: ["completed", "archived"], completed: ["archived"], archived: [] };
    if (typeof body.status !== "string" || !transitions[existing.status]?.includes(body.status)) return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
    if (body.status === "published" && existing.data?.source === "ims_generator") {
      if (existing.data?.pdf_mode === "coach") return NextResponse.json({ error: "Coach-only PDF cannot be published to clients" }, { status: 400 });
      if (existing.coach_edits && Object.keys(existing.coach_edits).length > 0) return NextResponse.json({ error: "Regenerate the PDF to include coach edits before publishing" }, { status: 409 });
      if (!existing.data?.structured_program || !existing.pdf_client_url) return NextResponse.json({ error: "Incomplete generated program" }, { status: 409 });
      return NextResponse.json({ error: "Publish generated programs through the coach review workflow" }, { status: 409 });
    }
    update.status = body.status;
    if (body.status === "published") update.published_at = new Date().toISOString();
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  update.updated_at = new Date().toISOString();
  const { data: saved, error } = await supabase.from("programs").update(update).eq("id", id).eq("updated_at", existing.updated_at).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to save program" }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Program changed since you opened it; refresh and retry" }, { status: 409 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
