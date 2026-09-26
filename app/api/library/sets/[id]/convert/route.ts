import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exerciseSetIds, isExerciseSet, UUID } from "@/lib/exercises/catalog";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid exercise set." }, { status: 400 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const viewer = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (viewer.error) return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
  if (!viewer.data || viewer.data.deleted_at || !["owner","trainer"].includes(viewer.data.role)) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const source = await db.from("programs").select("id,name,client_id,data,status,updated_at").eq("id", id).maybeSingle();
  if (source.error) return NextResponse.json({ error: "Exercise set lookup unavailable." }, { status: 503 });
  if (!source.data || source.data.status !== "draft" || !isExerciseSet(source.data.data)) return NextResponse.json({ error: "Private exercise set not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0,160) : source.data.name;
  const programId = typeof body.request_id === "string" && UUID.test(body.request_id) ? body.request_id : null;
  if (!programId) return NextResponse.json({ error: "Start a fresh conversion and retry." }, { status: 400 });
  const exercises = Array.isArray(source.data.data.exercises) ? source.data.data.exercises : [];
  const data = {
    source: "ims_library_program",
    origin_exercise_set_id: source.data.id,
    origin_exercise_set_updated_at: source.data.updated_at,
    programming_path: "quick",
    prescription_status: "needs_prescription",
    visibility: "coach_only",
    canonical_ids: exerciseSetIds(source.data.data),
    exercises,
    coach_note: typeof source.data.data.note === "string" ? source.data.data.note : "",
  };
  const existing = await db.from("programs").select("id,client_id,data").eq("id", programId).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Program save could not be checked." }, { status: 503 });
  if (existing.data) {
    const same = existing.data.client_id === source.data.client_id && existing.data.data?.origin_exercise_set_id === source.data.id;
    return same ? NextResponse.json({ ok: true, id: existing.data.id, deduped: true }) : NextResponse.json({ error: "This conversion reference is already in use." }, { status: 409 });
  }
  const saved = await db.from("programs").insert({ id: programId, client_id: source.data.client_id, trainer_id: user.id, name, status: "draft", weeks: 4, data, coach_edits: {} }).select("id").single();
  if (saved.error || !saved.data) return NextResponse.json({ error: "Could not create the draft program. The exercise set was not changed." }, { status: 503 });
  return NextResponse.json({ ok: true, id: saved.data.id, deduped: false }, { status: 201 });
}
