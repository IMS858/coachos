import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCapture, MAX_DEMO_BYTES, VIDEO_MIMES } from "@/lib/exercises/capture";
import { saveCapture, CaptureError } from "@/lib/exercises/capture-server";
import { smallJson } from "@/lib/media/request";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Sign in to add exercises." }, 401);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({ error: "Authorization unavailable." }, 503);
  if (!me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) return reply({ error: "Active staff account required." }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Invalid request origin." }, 403);
  let input;
  try { input = parseCapture(await smallJson(request), user.id); }
  catch (e) { return reply({ error: e instanceof Error ? e.message : "Invalid exercise." }, 400); }
  if (input.video_storage_path) {
    // Verify an existing private file, not an arbitrary caller-supplied URL/path.
    const path = input.video_storage_path;
    const slash = path.lastIndexOf("/");
    const fileName = path.slice(slash + 1);
    const storage = await createServiceClient().storage.from("client-media").list(path.slice(0, slash), { search: fileName, limit: 2 });
    if (storage.error) return reply({ error: "Video verification unavailable. Retry without uploading again." }, 503);
    const file = storage.data?.find(item => item.name === fileName && item.id);
    const size = Number(file?.metadata?.size);
    const mime = file?.metadata?.mimetype;
    const expected = VIDEO_MIMES[fileName.split(".").pop() as keyof typeof VIDEO_MIMES];
    if (!file || !Number.isFinite(size) || size <= 0 || size > MAX_DEMO_BYTES || mime !== expected) return reply({ error: "The complete, supported video upload could not be verified." }, 409);
  }
  try { return reply(await saveCapture(db, user.id, input), 201); }
  catch (e) {
    if (e instanceof CaptureError) return reply({ error: e.message, exercise_saved: e.exerciseSaved }, e.status);
    return reply({ error: "Save unavailable. Retry the same action; your form is still here." }, 503);
  }
}
