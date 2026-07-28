import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";
import { assessWaivers, outstandingRequired } from "@/lib/waivers";

export const dynamic = "force-dynamic";

/**
 * GET  → where this client stands on every agreement
 * POST → email them a link to sign whatever's outstanding
 *
 * The email points at the app rather than carrying a one-time token: they
 * already have an account, so signing in is the identity check, and there's no
 * link that could be forwarded and signed by someone else.
 */
async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes((me as any).role)) {
    return { err: NextResponse.json({ error: "Staff only" }, { status: 403 }) };
  }
  return { err: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { err } = await requireStaff();
  if (err) return err;

  const svc = createServiceClient();

  // Massage consent only applies to clients who actually receive bodywork, and
  // minor consent only under 18 — derived rather than assumed.
  const { data: clientRow } = await svc
    .from("clients")
    .select("date_of_birth")
    .eq("id", id)
    .maybeSingle();
  const { data: massagePlans } = await svc
    .from("plans")
    .select("id")
    .eq("client_id", id)
    .eq("service_type", "massage")
    .limit(1);
  const dob = (clientRow as any)?.date_of_birth;
  const isMinor = dob
    ? (Date.now() - new Date(dob).getTime()) / 31557600000 < 18
    : false;
  const receivesMassage = ((massagePlans ?? []) as any[]).length > 0;

  const { data: rows } = await svc
    .from("waivers")
    .select("waiver_type, waiver_version, signed_at")
    .eq("client_id", id);

  const statuses = assessWaivers((rows ?? []) as any, { receivesMassage, isMinor });
  return NextResponse.json({
    statuses,
    outstanding_required: outstandingRequired(statuses).length,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { err } = await requireStaff();
  if (err) return err;

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles").select("email, full_name").eq("id", id).maybeSingle();
  const email = (profile as any)?.email;
  if (!email) {
    return NextResponse.json(
      { error: "This client has no email on file." },
      { status: 400 }
    );
  }


  // Massage consent only applies to clients who actually receive bodywork, and
  // minor consent only under 18 — derived rather than assumed.
  const { data: clientRow } = await svc
    .from("clients")
    .select("date_of_birth")
    .eq("id", id)
    .maybeSingle();
  const { data: massagePlans } = await svc
    .from("plans")
    .select("id")
    .eq("client_id", id)
    .eq("service_type", "massage")
    .limit(1);
  const dob = (clientRow as any)?.date_of_birth;
  const isMinor = dob
    ? (Date.now() - new Date(dob).getTime()) / 31557600000 < 18
    : false;
  const receivesMassage = ((massagePlans ?? []) as any[]).length > 0;

  const { data: rows } = await svc
    .from("waivers")
    .select("waiver_type, waiver_version, signed_at")
    .eq("client_id", id);
  const statuses = assessWaivers((rows ?? []) as any, { receivesMassage, isMinor });
  const pending = statuses.filter((s) => s.state !== "current");

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "nothing_outstanding" });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
  const firstName = String((profile as any).full_name ?? "").split(" ")[0] || "there";
  const list = pending
    .map((p) => {
      const why =
        p.state === "expired" ? "due for renewal"
        : p.state === "outdated" ? "updated wording"
        : "not signed yet";
      return `<li style="margin-bottom:4px;">${p.title} <span style="color:#6b7280;">— ${why}</span></li>`;
    })
    .join("");

  const result = await sendEmail({
    to: email,
    subject: "A quick signature needed — IMS",
    html: emailShell({
      heading: `${firstName}, one quick thing`,
      bodyHtml: `
        <p>Your paperwork needs a signature before your next session:</p>
        <ul style="color:#4b5563;padding-left:20px;">${list}</ul>
        <p style="margin:24px 0;">
          <a href="${site}/waivers" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
            Sign now
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Sign in as usual and it'll take about a minute.</p>
      `,
    }),
  });

  return NextResponse.json({
    ok: true,
    sent: result.ok,
    count: pending.length,
    error: result.ok ? null : result.error,
  });
}
