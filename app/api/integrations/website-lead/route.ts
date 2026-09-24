import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Internal website-to-Coach-OS integration. Never expose its secret in browser code. */
export async function POST(request: NextRequest) {
  const secret = process.env.IMS_WEBSITE_SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!authorized(request.headers.get("x-ims-sync-secret"), secret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") || 0) > 12000)
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone || "").trim().slice(0, 60);
  const message = String(body.message || "").trim().slice(0, 4000);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message)
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });

  const svc = createServiceClient();
  const { data: matches, error: lookupError } = await svc.from("leads")
    .select("id, stage, source, notes").eq("email", email).limit(1);
  if (lookupError) return NextResponse.json({ error: "Lookup failed" }, { status: 503 });
  const existing = matches?.[0];
  if (existing) {
    // Preserve lifecycle/source, but never silently drop a new website enquiry.
    // Append the enquiry to the audit trail regardless of where the lead originated.
    const entry = "[Website enquiry] " + message;
    const oldNotes = existing.notes || "";
    if (oldNotes.includes(entry))
      return NextResponse.json({ ok: true, existing: true, duplicate: true, id: existing.id });
    const { error } = await svc.from("leads").update({
      notes: (oldNotes ? oldNotes + "\n\n" : "") + entry,
      stage: existing.stage === "not_interested" ? existing.stage : "new",
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) return NextResponse.json({ error: "Update failed" }, { status: 503 });
    return NextResponse.json({ ok: true, existing: true, id: existing.id });
  }
  const parts = name.split(/\s+/);
  const { data, error } = await svc.from("leads").insert({
    first_name: parts[0] || null,
    last_name: parts.slice(1).join(" ") || null,
    full_name: name, email, phone: phone || null,
    interest: "Website enquiry", source: "website_contact",
    stage: "new", notes: "[Website enquiry] " + message,
  }).select("id").single();
  if (error) return NextResponse.json({ error: "Create failed" }, { status: 503 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
