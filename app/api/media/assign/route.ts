import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * POST /api/media/assign
 * Assign library exercises to a client as homework.
 *
 * The alternative — re-filming the same drill for every client — is what makes
 * a video library expensive and inconsistent. Record "Hip 90/90 PAILs" once,
 * assign it twenty times.
 *
 * Accepts several at a time because homework is usually prescribed as a set.
 */
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
  const exerciseIds: string[] = Array.isArray(b.exercise_ids) ? b.exercise_ids : [];
  const note = String(b.note ?? "").trim();
  const category = ["mobility", "strength", "conditioning", "general"].includes(b.category)
    ? b.category : "mobility";

  if (!clientId || exerciseIds.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one exercise." },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  const { data: exercises } = await svc
    .from("exercises")
    .select("id, name, ims_label")
    .in("id", exerciseIds);

  if (!exercises || exercises.length === 0) {
    return NextResponse.json({ error: "Those exercises weren't found." }, { status: 404 });
  }

  // Don't assign the same drill twice — re-assigning should feel idempotent.
  const { data: existing } = await svc
    .from("client_media")
    .select("exercise_id")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .in("exercise_id", exerciseIds);

  const already = new Set((existing ?? []).map((e: any) => e.exercise_id));
  const toInsert = (exercises as any[])
    .filter((ex) => !already.has(ex.id))
    .map((ex) => ({
      client_id: clientId,
      uploaded_by: user.id,
      kind: "video",
      category,
      title: ex.ims_label || ex.name,
      note: note || null,
      exercise_id: ex.id,
      storage_path: null,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      added: 0,
      skipped: exercises.length,
      message: "Already assigned.",
    });
  }

  const { error } = await svc.from("client_media").insert(toInsert as never);
  if (error) {
    console.error("[media/assign]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // One email for the batch, not one per exercise.
  let notified = false;
  try {
    const { data: profile } = await svc
      .from("profiles").select("email, full_name").eq("id", clientId).maybeSingle();
    const email = (profile as any)?.email;
    if (email) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
      const firstName =
        String((profile as any).full_name ?? "").trim().split(" ")[0] || "there";
      const list = toInsert
        .map((i) => `<li style="margin-bottom:4px;">${i.title.replace(/[<>]/g, "")}</li>`)
        .join("");
      const result = await sendEmail({
        to: email,
        subject: `New ${category} homework from IMS`,
        html: emailShell({
          heading: `${firstName}, you've got homework`,
          bodyHtml: `
            <p>Jason assigned you ${toInsert.length} thing${toInsert.length === 1 ? "" : "s"} to work on:</p>
            <ul style="color:#4b5563;padding-left:20px;">${list}</ul>
            ${note ? `<p style="color:#4b5563;">${note.replace(/[<>]/g, "")}</p>` : ""}
            <p style="margin:24px 0;">
              <a href="${site}/plan" style="background:#1c6a9c;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">
                See your homework
              </a>
            </p>
          `,
        }),
      });
      notified = result.ok;
    }
  } catch (err) {
    console.warn("[media/assign] notify failed:", err);
  }

  return NextResponse.json({
    ok: true,
    added: toInsert.length,
    skipped: exercises.length - toInsert.length,
    notified,
  });
}
