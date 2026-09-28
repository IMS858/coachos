import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { parseContactPatch } from "@/lib/clients/profile-patch";
import { smallJson } from "@/lib/media/request";

/** Profile-only contact updates. Plans and portal activation remain separate. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { id } = await context.params;
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  const user = auth.data.user;
  if (auth.error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await supabase.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (actor.error) return NextResponse.json({ error: "Staff authorization could not be verified." }, { status: 503 });
  const profile = actor.data;
  if (!profile || profile.deleted_at || !["owner", "trainer"].includes(profile.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Resolve the actual RLS-scoped client before writing its profile.
  const scope = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
  if (scope.error) return NextResponse.json({ error: "Client access could not be verified." }, { status: 503 });
  if (!scope.data) return NextResponse.json({ error: "Client not found or not assigned." }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    const input = await smallJson(request, 8192);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid request.");
    body = input as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid client request." }, { status: 400 }); }
  const kind = body.kind;
  if (kind === "profile") {
    const target = await supabase.from("profiles").select("contact_only").eq("id", id).eq("role", "client").is("deleted_at", null).maybeSingle();
    if (target.error) return NextResponse.json({ error: "Client profile could not be verified." }, { status: 503 });
    if (!target.data) return NextResponse.json({ error: "Client profile not found." }, { status: 404 });
    let patch;
    try { patch = parseContactPatch(body, target.data.contact_only); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid contact details." }, { status: 400 }); }
    const saved = await supabase.from("profiles").update(patch).eq("id", id).select("id").maybeSingle();
    if (saved.error) return NextResponse.json({ error: saved.error.code === "23505" ? "That email already belongs to another profile. Keep these people separate and use a distinct email." : "Profile save failed." }, { status: saved.error.code === "23505" ? 409 : 500 });
    if (!saved.data) return NextResponse.json({ error: "Profile change was not authorized or saved." }, { status: 403 });
    await recordAudit({actorId:user.id,action:"client.profile_updated",entityType:"client",entityId:id,changes:{full_name_changed:body.full_name!==undefined,email_changed:body.email!==undefined,phone_changed:body.phone!==undefined,avatar_changed:body.avatar_url!==undefined}});
    return NextResponse.json({ ok: true });
  }
  if (kind === "status") {
    const allowed = ["active", "lead", "paused", "churned", "assessment_booked", "assessment_completed"];
    if (typeof body.status !== "string" || !allowed.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const saved = await supabase.from("clients").update({ status: body.status as "active" | "lead" | "paused" | "churned" | "assessment_booked" | "assessment_completed" }).eq("id", id).select("id").maybeSingle();
    if (saved.error) return NextResponse.json({ error: "Status update failed" }, { status: 500 });
    if (!saved.data) return NextResponse.json({ error: "Status change was not authorized or saved." }, { status: 403 });
    await recordAudit({actorId:user.id,action:"client.status_updated",entityType:"client",entityId:id,changes:{status:body.status}});
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
}
