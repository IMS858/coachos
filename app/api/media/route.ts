import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** POST /api/media — staff records a piece of homework after the file uploads. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const b = await request.json().catch(() => ({}));
  const clientId = String(b.client_id ?? "");
  const title = String(b.title ?? "").trim();
  const storagePath = String(b.storage_path ?? "");
  const category = ["mobility", "strength", "conditioning", "general"].includes(b.category)
    ? b.category : "mobility";
  const kind = b.kind === "image" ? "image" : "video";

  if (!clientId || !title || !storagePath) {
    return NextResponse.json(
      { error: "client_id, title and storage_path are required" },
      { status: 400 }
    );
  }
  // The path's first segment must match the client it's being filed under,
  // otherwise a mistyped id could file a video into someone else's folder.
  if (!storagePath.startsWith(`${clientId}/`)) {
    return NextResponse.json({ error: "Path doesn't match client" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("client_media")
    .insert({
      client_id: clientId,
      uploaded_by: user.id,
      kind,
      category,
      title,
      note: String(b.note ?? "").trim() || null,
      storage_path: storagePath,
      poster_path: String(b.poster_path ?? "") || null,
      duration_seconds: Number.isFinite(b.duration_seconds)
        ? Math.round(b.duration_seconds)
        : null,
    } as never)
    .select("id")
    .single();

  if (error) {
    console.error("[media] insert:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Tell them it's there. Without this a client only finds homework by
  // happening to open the app — which mostly means they never do.
  // Best effort: a mail failure must not undo a successful upload.
  let notified = false;
  try {
    const { data: profile } = await svc
      .from("profiles")
      .select("email, full_name")
      .eq("id", clientId)
      .maybeSingle();

    const email = (profile as any)?.email;
    if (email) {
      const site =
        process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
      const firstName =
        String((profile as any).full_name ?? "").trim().split(" ")[0] || "there";
      const label =
        kind === "image" ? "a reference photo" : "a new video";

      const result = await sendEmail({
        to: email,
        subject: `New ${category} homework from IMS`,
        html: emailShell({
          heading: `${firstName}, you've got homework`,
          bodyHtml: `
            <p>Jason sent you ${label}: <strong>${title.replace(/[<>]/g, "")}</strong></p>
            ${
              String(b.note ?? "").trim()
                ? `<p style="color:#4b5563;">${String(b.note).trim().replace(/[<>]/g, "")}</p>`
                : ""
            }
            <p style="margin:24px 0;">
              <a href="${site}/plan" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
                Watch it
              </a>
            </p>
            <p style="color:#6b7280;font-size:13px;">It's under Homework on your plan, and it stays there — rewatch it any time.</p>
          `,
        }),
      });
      notified = result.ok;
      if (notified) {
        await svc
          .from("client_media")
          .update({ notified_at: new Date().toISOString() } as never)
          .eq("id", (data as any).id);
      }
    }
  } catch (err) {
    console.warn("[media] notify failed:", err);
  }

  return NextResponse.json({ ok: true, id: (data as any).id, notified });
}
