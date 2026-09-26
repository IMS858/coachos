import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { demoPath, MAX_DEMO_BYTES, VIDEO_MIMES } from "@/lib/exercises/capture";
import { smallJson } from "@/lib/media/request";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Unauthorized" }, 401);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({ error: "Authorization unavailable" }, 503);
  if (!me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) return reply({ error: "Staff only" }, 403);
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "Invalid request origin" }, 403);
  let path: string;
  let body: { request_id: string; ext: string; size: number; mime: string };
  try {
    body = await smallJson(request, 2048) as typeof body;
    if (!body || typeof body !== "object" || typeof body.ext !== "string" || typeof body.request_id !== "string") throw new Error("Invalid upload details.");
    path = demoPath(user.id, body.request_id, body.ext);
    if (!Number.isInteger(body.size) || body.size <= 0 || body.size > MAX_DEMO_BYTES) throw new Error("Video must be under 500 MB.");
    if (body.mime !== VIDEO_MIMES[body.ext as keyof typeof VIDEO_MIMES]) throw new Error("Unsupported video format.");
  } catch (e) { return reply({ error: e instanceof Error ? e.message : "Invalid upload" }, 400); }
  const bucket = createServiceClient().storage.from("client-media");
  const name = path.slice(path.lastIndexOf("/") + 1);
  const existing = await bucket.list(`exercise-drafts/${user.id}`, { search: name, limit: 2 });
  if (existing.error) return reply({ error: "Upload lookup unavailable." }, 503);
  const file = existing.data?.find(item => item.name === name && item.id);
  if (file) {
    if (Number(file.metadata?.size) !== body.size || file.metadata?.mimetype !== body.mime) return reply({ error: "This upload reference is already in use." }, 409);
    return reply({ storage_path: path, uploaded: true });
  }
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) return reply({ error: "Could not prepare private exercise demo upload." }, 503);
  return reply({ storage_path: path, signedUrl: data.signedUrl, uploaded: false });
}
