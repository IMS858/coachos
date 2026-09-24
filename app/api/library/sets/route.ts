import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseExerciseSetInput } from "@/lib/exercises/catalog";
import { ExerciseSetError, saveExerciseSet } from "@/lib/exercises/collections-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function boundedBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Choose exercises before saving.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new Error("Exercise selection is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
async function save(request: Request, editing: boolean) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to save exercise selections." }, { status: 401, headers });
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profile.error) return NextResponse.json({ error: "Staff authorization is unavailable." }, { status: 503, headers });
  if (!profile.data || profile.data.deleted_at || !["owner", "trainer"].includes(profile.data.role)) {
    return NextResponse.json({ error: "Exercise selections are a staff workspace." }, { status: 403, headers });
  }
  // Web-only mutation. Browser origins must match; native clients do not use this staff route.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  let input;
  try { input = parseExerciseSetInput(await boundedBody(request), editing); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid selection." }, { status: 400, headers }); }
  try {
    const result = await saveExerciseSet(db, user.id, input, editing);
    return NextResponse.json({ ok: true, ...result, visibility: "coach_only", client_url: `/clients/${input.client_id}#exercise-sets` }, { status: editing || result.deduped ? 200 : 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ExerciseSetError ? error.message : "Unable to save this selection. Please retry." }, { status: error instanceof ExerciseSetError ? error.status : 503, headers });
  }
}
export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }
