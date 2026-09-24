import { type NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 12000;
const MAX_NOTES_LENGTH = 100000;
const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function authorized(actual: string | null, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function readBody(request: NextRequest): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("Too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function field(body: Record<string, unknown>, key: string, max: number, required = false): string {
  if (body[key] == null && !required) return "";
  if (typeof body[key] !== "string") throw new Error("Invalid field");
  const value = body[key].trim();
  if ((required && !value) || value.length > max || (key !== "message" && /[\r\n\0]/.test(value))) throw new Error("Invalid field");
  return value;
}
/** Server-to-server intake only. Never reset lifecycle, send mail or create an auth account. */
export async function POST(request: NextRequest) {
  const secret = process.env.IMS_WEBSITE_SYNC_SECRET;
  if (!secret) return reply({ error: "Not configured" }, 503);
  if (!authorized(request.headers.get("x-ims-sync-secret"), secret)) return reply({ error: "Unauthorized" }, 401);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return reply({ error: "Too large" }, 413);
  let raw: unknown;
  try { raw = await readBody(request); }
  catch (error) { return reply({ error: error instanceof RangeError ? "Too large" : "Invalid data" }, error instanceof RangeError ? 413 : 400); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return reply({ error: "Invalid data" }, 400);
  let name: string, email: string, phone: string, message: string, inquiryId: string;
  try {
    const body = raw as Record<string, unknown>;
    name = field(body, "name", 120, true);
    email = field(body, "email", 254, true).toLowerCase();
    phone = field(body, "phone", 60);
    message = field(body, "message", 4000, true);
    inquiryId = field(body, "inquiry_id", 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (inquiryId && !/^[A-Za-z0-9_-]+$/.test(inquiryId))) throw new Error("Invalid data");
  } catch { return reply({ error: "Missing or invalid fields" }, 400); }
  const eventKey = inquiryId || "legacy-" + createHash("sha256").update(JSON.stringify({ name, email, phone, message })).digest("hex");
  // Single-line JSON keeps user-authored newlines from impersonating an audit marker.
  const marker = `[Website enquiry:${eventKey}] `;
  const entry = marker + JSON.stringify({ message });
  const pattern = email.replace(/[\\%_]/g, "\\$&");
  const svc = createServiceClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: matches, error: lookupError } = await svc.from("leads")
      .select("id, notes").ilike("email", pattern).limit(2);
    if (lookupError) return reply({ error: "Lookup failed" }, 503);
    if ((matches?.length ?? 0) > 1) return reply({ error: "Ambiguous lead identity; review required" }, 409);
    const existing = matches?.[0];
    if (existing) {
      const oldNotes: string = existing.notes ?? "";
      const prior = oldNotes.split("\n").find(line => line.startsWith(marker));
      if (prior) return prior === entry
        ? reply({ ok: true, existing: true, duplicate: true, id: existing.id })
        : reply({ error: "Inquiry reference was reused with different content" }, 409);
      const notes = (oldNotes ? oldNotes + "\n\n" : "") + entry;
      if (notes.length > MAX_NOTES_LENGTH) return reply({ error: "Inquiry history needs review" }, 409);
      // Compare-and-swap protects concurrent staff edits and simultaneous inquiries.
      let update = svc.from("leads").update({ notes, updated_at: new Date().toISOString() }).eq("id", existing.id);
      update = existing.notes == null ? update.is("notes", null) : update.eq("notes", existing.notes);
      const { data: updated, error } = await update.select("id").maybeSingle();
      if (error) return reply({ error: "Update failed" }, 503);
      if (!updated) continue;
      return reply({ ok: true, existing: true, id: existing.id });
    }
    const parts = name.split(/\s+/);
    const { data, error } = await svc.from("leads").insert({
      first_name: parts[0], last_name: parts.slice(1).join(" ") || null,
      full_name: name, email, phone: phone || null, interest: "Website enquiry",
      source: "website_contact", stage: "new", notes: entry,
    }).select("id").single();
    if (error?.code === "23505") continue; // A concurrent insert may now be available for matching.
    if (error || !data) return reply({ error: "Create failed" }, 503);
    return reply({ ok: true, id: data.id }, 201);
  }
  return reply({ error: "Concurrent update; retry with the same inquiry reference" }, 503);
}
