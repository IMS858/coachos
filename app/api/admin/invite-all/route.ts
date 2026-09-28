import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendLoginInvite } from "@/lib/invite";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/invite-all  → who would be invited (dry run, sends nothing)
 * POST /api/admin/invite-all  → send invites to clients who have never signed in
 *
 * Owner-only. "Never signed in" comes from Supabase auth's last_sign_in_at, so
 * anyone already using the app is skipped and nobody gets a confusing second
 * invite. Sends are throttled to stay inside Resend's rate limit.
 */

async function findUninvited() {
  const svc = createServiceClient();
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("role", "client")
    .eq("contact_only", false)
    .is("deleted_at", null);
  const clients = (profiles ?? []).filter((p: any) => p.email);
  if (clients.length === 0) return [];
  const signedIn = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.last_sign_in_at && u.email) signedIn.add(u.email.toLowerCase());
    }
    if (data.users.length < 200) break;
  }
  return clients.filter((c: any) => !signedIn.has(String(c.email).toLowerCase()));
}

async function requireOwner() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: me, error: actorError } = await supabase
    .from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (actorError) return { error: NextResponse.json({ error: "Owner authorization unavailable" }, { status: 503 }) };
  if (me?.role !== "owner" || me.deleted_at) return { error: NextResponse.json({ error: "Active owner only" }, { status: 403 }) };
  return { error: null };
}

export async function GET() {
  const { error } = await requireOwner();
  if (error) return error;
  const pending = await findUninvited();
  return NextResponse.json({ count: pending.length, clients: pending.map((c: any) => ({ name: c.full_name, email: c.email })) });
}

export async function POST(_request: NextRequest) {
  const { error } = await requireOwner();
  if (error) return error;
  const pending = await findUninvited();
  const results: { name: string; email: string; sent: boolean; error: string | null }[] = [];
  for (const c of pending as any[]) {
    const r = await sendLoginInvite(c.email, c.full_name);
    results.push({ name: c.full_name ?? c.email, email: c.email, sent: r.sent, error: r.error });
    await new Promise((res) => setTimeout(res, 600));
  }
  return NextResponse.json({ ok: true, total: results.length, sent: results.filter((r) => r.sent).length, failed: results.filter((r) => !r.sent).length, results });
}
