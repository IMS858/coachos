import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/mailer";
import { smallJson } from "@/lib/media/request";
import { CAPTURE_UUID } from "@/lib/exercises/capture";
export const dynamic = "force-dynamic";
const MIME: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: reply({ error: "Sign in to send a clip." }, 401) };
  const profile = await db.from("profiles").select("role,deleted_at,full_name").eq("id", user.id).maybeSingle();
  if (profile.error) return { error: reply({ error: "Account lookup unavailable." }, 503) };
  if (!profile.data || profile.data.deleted_at || profile.data.role !== "client") return { error: reply({ error: "Client account required." }, 403) };
  const client = await db.from("clients").select("id").eq("id", user.id).maybeSingle();
  if (client.error) return { error: reply({ error: "Client lookup unavailable." }, 503) };
  if (!client.data) return { error: reply({ error: "Client account unavailable." }, 403) };
  const origin = request.headers.get("origin");
  if ((origin && origin !== request.nextUrl.origin) || request.headers.get("sec-fetch-site") === "cross-site") return { error: reply({ error: "Invalid request origin." }, 403) };
  return { user, profile: profile.data };
}
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const ext = request.nextUrl.searchParams.get("ext")?.toLowerCase() ?? "jpg";
  if (!Object.hasOwn(MIME, ext)) return reply({ error: "Unsupported media format." }, 400);
  const path = `${user.id}/from-client-${crypto.randomUUID()}.${ext}`;
  const result = await createServiceClient().storage.from("client-media").createSignedUploadUrl(path);
  if (result.error || !result.data) return reply({ error: "Could not prepare the upload." }, 503);
  return reply({ path, signedUrl: result.data.signedUrl });
}
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const user = auth.user!;
  const body = await smallJson(request, 8192).catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !["storage_path", "note", "kind"].includes(key))) return reply({ error: "Invalid clip details." }, 400);
  const path = typeof body.storage_path === "string" ? body.storage_path : "";
  const parts = /^([^/]+)\/from-client-([^/.]+)\.(mp4|mov|webm|jpg|jpeg|png|webp)$/.exec(path);
  if (!parts || parts[1] !== user.id || !CAPTURE_UUID.test(parts[2])) return reply({ error: "This upload does not belong to your account." }, 400);
  const note = body.note == null ? "" : body.note;
  if (typeof note !== "string" || note.length > 1000) return reply({ error: "Keep the coaching note under 1,000 characters." }, 400);
  const kind = MIME[parts[3]].startsWith("video/") ? "video" : "image";
  if (body.kind !== kind) return reply({ error: "Media kind does not match the uploaded file." }, 400);
  const svc = createServiceClient();
  const columns = "id,client_id,storage_path,note,kind,notified_at";
  const lookup = () => svc.from("client_media").select(columns).eq("client_id", user.id).eq("storage_path", path).maybeSingle();
  const prior = await lookup();
  if (prior.error) return reply({ error: "Save lookup unavailable. Retry without uploading again." }, 503);
  const same = (row: { client_id?: string; storage_path?: string | null; note?: string | null; kind?: string } | null) => !!row && row.client_id === user.id && row.storage_path === path && (row.note ?? "") === note.trim() && row.kind === kind;
  if (prior.data) return same(prior.data) ? reply({ ok: true, notified: !!prior.data.notified_at, deduped: true }) : reply({ error: "This clip was already saved with different details. Reopen the coaching record rather than duplicate it." }, 409);
  const fileName = path.slice(path.indexOf("/") + 1);
  const files = await svc.storage.from("client-media").list(user.id, { search: fileName, limit: 2 });
  if (files.error) return reply({ error: "Upload verification unavailable. Retry this same save." }, 503);
  const file = files.data?.find(row => row.name === fileName && row.id);
  if (!file || file.metadata?.mimetype !== MIME[parts[3]] || !(Number(file.metadata?.size) > 0) || Number(file.metadata?.size) > 200 * 1024 * 1024) return reply({ error: "The complete upload could not be verified. Use a supported file under 200 MB." }, 409);
  const result = await svc.from("client_media").insert({ id: parts[2], client_id: user.id, uploaded_by: user.id, kind, category: "general", title: "Client technique clip", note: note.trim() || null, storage_path: path, review_status: "awaiting_review" }).select("id").single();
  if (result.error?.code === "23505") {
    const repeated = await lookup();
    if (!repeated.error && same(repeated.data)) return reply({ ok: true, notified: !!repeated.data?.notified_at, deduped: true });
  }
  if (result.error || !result.data) return reply({ error: "Saving was not confirmed. Keep this page open and retry the same save." }, 503);
  let notified = false;
  try {
    const email = process.env.OWNER_EMAIL;
    if (email) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://coachos-opal.vercel.app";
      const sent = await sendEmail({ to: email, idempotencyKey: `client-clip/${result.data.id}`, subject: "A client sent a coaching clip", html: emailShell({ heading: "New coaching clip", bodyHtml: `<p>A client uploaded a ${kind === "video" ? "video" : "photo"} for feedback.</p><p><a href="${site}/clients/${user.id}">Open the client coaching record</a></p>` }) });
      notified = sent.ok;
      if (notified) await svc.from("client_media").update({ notified_at: new Date().toISOString() }).eq("id", result.data.id);
    }
  } catch { /* Upload success and email delivery are reported separately. */ }
  return reply({ ok: true, id: result.data.id, notified, deduped: false }, 201);
}
