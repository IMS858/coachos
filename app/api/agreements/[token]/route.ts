import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { WAIVER_BY_TYPE } from "@/lib/waivers";

export const dynamic = "force-dynamic";

/**
 * Public, token-authenticated. No session required — the recipient may have no
 * account, which is the whole point.
 *
 * GET  → the documents to sign
 * POST → record the signatures
 *
 * Signatures from a known client are written to `waivers` (their permanent
 * record). Everyone else goes to `external_signatures`, so partner participants
 * never appear in the client roster or in billing.
 */
async function load(token: string) {
  const svc = createServiceClient();
  const { data } = await svc
    .from("agreement_requests")
    .select("id, client_id, partner_id, full_name, email, doc_types, note, expires_at, completed_at")
    .eq("token", token)
    .maybeSingle();
  return { svc, req: data as any };
}

export async function GET(
  _r: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { req } = await load(token);

  if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (req.completed_at) return NextResponse.json({ error: "already_signed" }, { status: 410 });
  if (new Date(req.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const docs = (req.doc_types as string[])
    .filter((t) => t in WAIVER_BY_TYPE)
    .map((t) => {
      const d = WAIVER_BY_TYPE[t as keyof typeof WAIVER_BY_TYPE];
      return { type: d.type, title: d.title, body: d.body, version: d.version };
    });

  return NextResponse.json({
    full_name: req.full_name,
    email: req.email,
    note: req.note,
    docs,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { svc, req } = await load(token);

  if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (req.completed_at) return NextResponse.json({ error: "already_signed" }, { status: 410 });
  if (new Date(req.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const b = await request.json().catch(() => ({}));
  const signatures = b.signatures as Record<string, string> | undefined;
  const signerName = String(b.full_name ?? req.full_name ?? "").trim();

  if (!signatures || Object.keys(signatures).length === 0) {
    return NextResponse.json({ error: "Nothing signed." }, { status: 400 });
  }
  if (!signerName) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const now = new Date().toISOString();

  const entries = Object.entries(signatures).filter(([t]) => t in WAIVER_BY_TYPE);

  if (req.client_id) {
    // A real client — this belongs on their permanent record.
    const rows = entries.map(([type, dataUrl]) => ({
      client_id: req.client_id,
      waiver_type: type,
      waiver_version: WAIVER_BY_TYPE[type as keyof typeof WAIVER_BY_TYPE].version,
      signed_at: now,
      ip_address: ip,
      user_agent: userAgent,
      signature_data_url: dataUrl,
    }));
    const { error } = await svc.from("waivers").insert(rows as never);
    if (error) {
      console.error("[agreements/sign] waivers:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const rows = entries.map(([type, dataUrl]) => ({
      request_id: req.id,
      partner_id: req.partner_id,
      full_name: signerName,
      email: req.email,
      waiver_type: type,
      waiver_version: WAIVER_BY_TYPE[type as keyof typeof WAIVER_BY_TYPE].version,
      signed_at: now,
      ip_address: ip,
      user_agent: userAgent,
      signature_data_url: dataUrl,
    }));
    const { error } = await svc.from("external_signatures").insert(rows as never);
    if (error) {
      console.error("[agreements/sign] external:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Single use — the link dies the moment it's been used.
  await svc
    .from("agreement_requests")
    .update({ completed_at: now, full_name: signerName } as never)
    .eq("id", req.id);

  return NextResponse.json({ ok: true, signed: entries.length });
}
