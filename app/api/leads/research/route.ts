import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { researchImportSchema } from "@/lib/leads/research";
import { RESEARCH_SOURCE } from "@/lib/leads/workspace";

export const dynamic = "force-dynamic";
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function readBody(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 65536) { await reader.cancel(); throw new Error("Research output is too large."); } chunks.push(next.value); }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function recordId(runId: string, index: number) {
  const hex = createHash("sha256").update(`ims-research:${runId}:${index}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
/** Staff-reviewed imports only. No external scraping, email, signup or qualification. */
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return reply({ error: "Sign in to save research." }, 401);
  const profile = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (profile.error) return reply({ error: "Authorization unavailable." }, 503);
  if (!profile.data || profile.data.deleted_at || !["owner","trainer"].includes(profile.data.role)) return reply({ error: "Staff only." }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  let raw: unknown;
  try { raw = await readBody(request); } catch { return reply({ error: "Paste a valid research JSON array within the size limit." }, 400); }
  const input = researchImportSchema.safeParse(raw);
  if (!input.success) return reply({ error: input.error.issues[0]?.message ?? "Invalid research candidates." }, 400);
  const today = new Date().toISOString().slice(0,10);
  if (input.data.candidates.some(row => row.checked_on > today)) return reply({ error: "Research cannot have a future verification date." }, 400);
  const records = input.data.candidates.map((candidate, index) => ({
    id: recordId(input.data.request_id, index), full_name: candidate.organization, first_name: null, last_name: null,
    email: null, phone: null, interest: "Personal Training partnership research", source: RESEARCH_SOURCE, stage: "new",
    notes: JSON.stringify({ type: "research_opportunity", request_id: input.data.request_id, submitted_by: user.id, qualification: "unverified", outreach_sent: false, ...candidate }, null, 2),
  }));
  const ids = records.map(row => row.id);
  const existing = await db.from("leads").select("id,source,notes").in("id", ids);
  if (existing.error) return reply({ error: "Research save could not be checked. Retry the same import." }, 503);
  const same = (rows: { id: string; source: string | null; notes: string | null }[]) => rows.length === records.length && records.every(record => rows.some(row => row.id === record.id && row.source === RESEARCH_SOURCE && row.notes === record.notes));
  if (existing.data?.length) return same(existing.data) ? reply({ ok: true, count: records.length, deduped: true }) : reply({ error: "This import reference is already in use. Do not overwrite earlier research." }, 409);
  const saved = await db.from("leads").insert(records).select("id");
  if (saved.error?.code === "23505") {
    const repeat = await db.from("leads").select("id,source,notes").in("id", ids);
    if (!repeat.error && same(repeat.data ?? [])) return reply({ ok: true, count: records.length, deduped: true });
    return reply({ error: "A candidate overlaps an existing record. Review duplicates before importing." }, 409);
  }
  if (saved.error || saved.data?.length !== records.length) return reply({ error: "Research results were not confirmed saved. Retry the same import." }, 503);
  return reply({ ok: true, count: records.length, qualified: false, outreach_sent: false }, 201);
}
