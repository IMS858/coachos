import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CAPTURE_UUID } from "@/lib/exercises/capture";
import { applyDraftPrescription, LIBRARY_DRAFT_SOURCE } from "@/lib/programs/library-draft";
import { smallJson } from "@/lib/media/request";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CAPTURE_UUID.test(id)) return reply({ error: "Invalid program." }, 400);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Unauthorized" }, 401);
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return reply({ error: "Authorization unavailable" }, 503);
  if (!me.data || me.data.deleted_at || !["owner", "trainer"].includes(me.data.role)) return reply({ error: "Staff only" }, 403);
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "Invalid origin" }, 403);
  let body: { expected_updated_at: string; exercises: unknown };
  try {
    body = await smallJson(request, 160000) as typeof body;
    if (!body || !body.expected_updated_at || !Number.isFinite(Date.parse(body.expected_updated_at)) || Object.keys(body).some(k => !["expected_updated_at", "exercises"].includes(k))) throw new Error();
  } catch { return reply({ error: "Invalid prescription update. Reopen the draft." }, 400); }
  const current = await db.from("programs").select("id,status,data,updated_at").eq("id", id).maybeSingle();
  if (current.error) return reply({ error: "Draft lookup unavailable" }, 503);
  if (!current.data || current.data.status !== "draft" || current.data.data?.source !== LIBRARY_DRAFT_SOURCE) return reply({ error: "Private library draft not found" }, 404);
  if (current.data.updated_at !== body.expected_updated_at) return reply({ error: "This draft changed elsewhere. Reopen it before saving." }, 409);
  let data;
  try { data = applyDraftPrescription(current.data.data, body.exercises); }
  catch (e) { return reply({ error: e instanceof Error ? e.message : "Invalid prescription" }, 400); }
  const saved = await db.from("programs").update({ data, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").eq("data->>source", LIBRARY_DRAFT_SOURCE).eq("updated_at", body.expected_updated_at).select("id,updated_at").maybeSingle();
  if (saved.error) return reply({ error: "Save was not confirmed. Your edits are still here." }, 503);
  if (!saved.data) return reply({ error: "Another edit won the save. Reopen this draft." }, 409);
  return reply({ ok: true, updated_at: saved.data.updated_at });
}
