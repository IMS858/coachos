import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/email-test
 * Owner-only. Sends a real email and reports exactly what happened.
 *
 * Exists because every other send path deliberately swallows failures so a
 * broken mailer can't break a checkout or a client conversion. That's the right
 * behaviour there and the wrong behaviour for diagnosis — so this route is the
 * one place that tells the whole truth.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const to = String(body.to ?? "").trim() || user.email || "";
  if (!to.includes("@")) {
    return NextResponse.json({ error: "Valid recipient required" }, { status: 400 });
  }

  // Report configuration without ever echoing the secret itself.
  const key = process.env.RESEND_API_KEY ?? "";
  const config = {
    api_key_present: Boolean(key),
    api_key_shape_ok: key.startsWith("re_"),
    api_key_hint: key ? `${key.slice(0, 6)}…${key.slice(-4)}` : null,
    from_address: process.env.RESEND_FROM_EMAIL ?? "(unset — using onboarding@resend.dev)",
    site_url: process.env.NEXT_PUBLIC_SITE_URL ?? "(unset)",
    owner_email: process.env.OWNER_EMAIL ?? "(unset)",
  };

  const result = await sendEmail({
    to,
    subject: "IMS Coach OS — email test",
    html: emailShell({
      heading: "Email is working",
      bodyHtml:
        "<p>If you're reading this, Coach OS can send email. Client invites, password resets and session reminders will all go out.</p>",
      footnote: "Sent from the email diagnostics panel.",
    }),
  });

  if (result.ok) {
    return NextResponse.json({ ok: true, id: result.id, to, config });
  }

  const guidance: Record<string, string> = {
    no_api_key:
      "RESEND_API_KEY is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy (env vars only load on a new build).",
    bad_api_key:
      "Resend rejected the key. Create a fresh key at resend.com/api-keys, replace the value in Vercel, then redeploy.",
    unverified_from:
      "The From address isn't on a verified domain. In Resend → Domains, confirm imsmethod.com is verified, and make sure RESEND_FROM_EMAIL uses that exact domain — e.g. \"IMS <hello@imsmethod.com>\". A From address on any other domain is rejected.",
    rate_limited: "Resend is rate limiting. Wait a minute and try again.",
    unknown: "Resend returned an error. The raw message is below.",
  };

  return NextResponse.json(
    {
      ok: false,
      reason: result.reason,
      error: result.error,
      guidance: guidance[result.reason] ?? guidance.unknown,
      to,
      config,
    },
    { status: 200 } // 200 so the panel can render the diagnosis rather than a fetch error
  );
}
