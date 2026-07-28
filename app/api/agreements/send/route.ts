import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";
import { WAIVER_BY_TYPE } from "@/lib/waivers";

export const dynamic = "force-dynamic";

/**
 * POST /api/agreements/send — staff send documents to someone for signature.
 *
 * Deliberately works for people with no account, because the two real cases
 * both involve them: a prospective client signing a membership agreement before
 * their first session, and a partner's study participants signing the facility
 * waiver. Requiring an account first would put a login in front of paperwork
 * that has to be done before anyone sets foot in the building.
 *
 * The token IS the credential, so it's long, single-use, and expires.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes((me as any).role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const docTypes: string[] = Array.isArray(b.doc_types) ? b.doc_types : [];
  const valid = docTypes.filter((t) => t in WAIVER_BY_TYPE);
  if (valid.length === 0) {
    return NextResponse.json({ error: "Pick at least one document." }, { status: 400 });
  }

  const email = String(b.email ?? "").trim();
  const fullName = String(b.full_name ?? "").trim();
  const clientId = b.client_id ? String(b.client_id) : null;
  const partnerId = b.partner_id ? String(b.partner_id) : null;

  if (!email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const svc = createServiceClient();

  const { data: reqRow, error } = await svc
    .from("agreement_requests")
    .insert({
      token,
      client_id: clientId,
      partner_id: partnerId,
      full_name: fullName || null,
      email,
      doc_types: valid,
      note: String(b.note ?? "").trim() || null,
      created_by: user.id,
    } as never)
    .select("id")
    .single();

  if (error) {
    console.error("[agreements/send]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
  const url = `${site}/sign/${token}`;
  const titles = valid.map((t) => WAIVER_BY_TYPE[t as keyof typeof WAIVER_BY_TYPE].title);
  const firstName = fullName.split(" ")[0] || "there";

  const result = await sendEmail({
    to: email,
    subject:
      valid.length === 1
        ? `Please sign: ${titles[0]}`
        : `${valid.length} documents to sign — IMS`,
    html: emailShell({
      heading: `${firstName}, a signature is needed`,
      bodyHtml: `
        ${b.note ? `<p style="color:#4b5563;">${String(b.note).replace(/[<>]/g, "")}</p>` : ""}
        <ul style="color:#4b5563;padding-left:20px;">
          ${titles.map((t) => `<li style="margin-bottom:4px;">${t}</li>`).join("")}
        </ul>
        <p style="margin:24px 0;">
          <a href="${url}" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Read &amp; sign
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">No account or password needed — the link opens straight to the documents. It expires in 30 days.</p>
      `,
    }),
  });

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    url,                       // returned so it can be copied if email fails
    error: result.ok ? null : result.error,
    request_id: (reqRow as any).id,
  });
}
