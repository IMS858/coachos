import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/messages/notify  { message_id }
 *
 * Messages are inserted straight from the browser to Supabase, so there was
 * nowhere to hang an email — which is why a message could sit unread for days.
 * The thread calls this immediately after a successful insert.
 *
 * THROTTLING
 * Only notifies when this is the FIRST unread message in the thread from that
 * side. A burst of four messages sends one email; once the recipient reads the
 * thread, the next message notifies again. No timers, no cron, and it can't
 * spam someone mid-conversation.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true });

    const body = await request.json().catch(() => ({}));
    const messageId = String(body.message_id ?? "");
    if (!messageId) return NextResponse.json({ ok: true });

    const svc = createServiceClient();
    const { data: msg } = await svc
      .from("messages")
      .select("id, client_id, sender_id, body, created_at")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) return NextResponse.json({ ok: true });

    const m = msg as any;
    if (m.sender_id !== user.id) return NextResponse.json({ ok: true });

    const senderIsClient = m.sender_id === m.client_id;

    // Anything else already unread from this side means they've been told.
    const { data: priorUnread } = await svc
      .from("messages")
      .select("id, sender_id")
      .eq("client_id", m.client_id)
      .is("read_at", null)
      .neq("id", m.id)
      .limit(20);

    const alreadyPending = (priorUnread ?? []).some((p: any) =>
      senderIsClient ? p.sender_id === m.client_id : p.sender_id !== m.client_id
    );
    if (alreadyPending) {
      return NextResponse.json({ ok: true, notified: false, reason: "already_pending" });
    }

    const { data: senderProfile } = await svc
      .from("profiles").select("full_name").eq("id", m.sender_id).maybeSingle();
    const senderName = String((senderProfile as any)?.full_name ?? "").split(" ")[0] || "Someone";

    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
    const preview = String(m.body ?? "").slice(0, 180).replace(/[<>]/g, "");

    let to: string | null = null;
    let subject = "";
    let heading = "";
    let link = `${site}/messages`;

    if (senderIsClient) {
      // Client wrote to the studio.
      to = process.env.OWNER_EMAIL ?? null;
      subject = `Message from ${senderName}`;
      heading = `${senderName} sent you a message`;
      link = `${site}/messages/${m.client_id}`;
    } else {
      // Staff wrote to a client.
      const { data: clientProfile } = await svc
        .from("profiles").select("email, full_name").eq("id", m.client_id).maybeSingle();
      to = (clientProfile as any)?.email ?? null;
      subject = "New message from IMS";
      heading = `${senderName} sent you a message`;
    }

    if (!to) return NextResponse.json({ ok: true, notified: false, reason: "no_recipient" });

    const result = await sendEmail({
      to,
      subject,
      html: emailShell({
        heading,
        bodyHtml: `
          <p style="color:#4b5563;border-left:3px solid #d7dce2;padding-left:14px;margin:18px 0;">
            ${preview}${String(m.body ?? "").length > 180 ? "…" : ""}
          </p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
              Reply
            </a>
          </p>
        `,
      }),
    });

    return NextResponse.json({ ok: true, notified: result.ok });
  } catch (err) {
    console.warn("[messages/notify]", err);
    return NextResponse.json({ ok: true, notified: false });
  }
}
