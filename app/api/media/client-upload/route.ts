import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * Client → coach media. A photo of a swollen ankle, or a video of a movement
 * that doesn't feel right.
 *
 * GET  → a signed upload URL scoped to the client's own folder
 * POST → record it and alert Jason
 *
 * Kept separate from /api/media (staff → client) on purpose: different
 * direction, different permissions, and this one must never let a client file
 * something against someone else's record.
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ext = (new URL(request.url).searchParams.get("ext") ?? "jpg")
    .toLowerCase().replace(/[^a-z0-9]/g, "");

  // Path is forced to the caller's own id — a client can't aim this elsewhere.
  const path = `${user.id}/from-client-${crypto.randomUUID()}.${ext}`;

  const svc = createServiceClient();
  const { data, error } = await svc.storage
    .from("client-media")
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[client-upload]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => ({}));
  const storagePath = String(b.storage_path ?? "");
  const note = String(b.note ?? "").trim().slice(0, 1000);
  const kind = b.kind === "video" ? "video" : "image";

  if (!storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const name = String((profile as any)?.full_name ?? "A client");

  const { error } = await svc.from("client_media").insert({
    client_id: user.id,
    uploaded_by: user.id,   // sender = client is what marks the direction
    kind,
    category: "general",
    title: `From ${name.split(" ")[0]}`,
    note: note || null,
    storage_path: storagePath,
  } as never);

  if (error) {
    console.error("[client-upload] insert:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // This one is time-sensitive — an injury photo is worth an immediate email.
  let notified = false;
  try {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
      const result = await sendEmail({
        to: ownerEmail,
        subject: `${name} sent you ${kind === "video" ? "a video" : "a photo"}`,
        html: emailShell({
          heading: `${name} sent you ${kind === "video" ? "a video" : "a photo"}`,
          bodyHtml: `
            ${note ? `<p style="color:#4b5563;border-left:3px solid #d7dce2;padding-left:14px;">${note.replace(/[<>]/g, "")}</p>` : "<p>No note attached.</p>"}
            <p style="margin:24px 0;">
              <a href="${site}/clients/${user.id}" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
                Open their profile
              </a>
            </p>
            <p style="color:#6b7280;font-size:13px;">If this looks like an injury, reply or call — they're expecting to hear back.</p>
          `,
        }),
      });
      notified = result.ok;
    }
  } catch (err) {
    console.warn("[client-upload] notify failed:", err);
  }

  return NextResponse.json({ ok: true, notified });
}
