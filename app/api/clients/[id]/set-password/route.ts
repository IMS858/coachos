import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/clients/[id]/set-password
 * OWNER-ONLY. Sets a temporary password directly.
 *
 * For the in-person case: the client is standing at the desk, email isn't
 * reaching them, and they want to be logged in now. The owner reads out the
 * generated password and the client signs in immediately.
 *
 * Deliberately owner-only rather than staff-wide: this grants access to
 * someone else's account, which is a meaningfully higher power than sending
 * them a link, so it shouldn't sit with every trainer.
 *
 * The password is generated server-side and shown once. It is never stored in
 * plaintext anywhere and never emailed.
 */

/** Readable but strong: avoids 0/O/1/l/I so it can be read aloud reliably. */
function generatePassword(): string {
  const words = [
    "anchor", "bridge", "cobalt", "dexter", "ember", "falcon", "granite",
    "harbor", "indigo", "juniper", "kestrel", "lantern", "meadow", "nomad",
    "orbit", "pioneer", "quarry", "ridge", "summit", "timber", "vector",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${pick()}-${pick()}-${digits}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }, error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me, error: actorError } = await supabase
    .from("profiles")
    .select("role, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (actorError) return NextResponse.json({ error: "Owner authorization could not be verified." }, { status: 503 });
  if (me?.role !== "owner" || me.deleted_at) {
    return NextResponse.json(
      { error: "Only the active owner can set a password directly." },
      { status: 403 }
    );
  }

  const svc = createServiceClient();
  const { data: target } = await svc
    .from("profiles")
    .select("role, full_name, email, contact_only")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (target.contact_only) return NextResponse.json({ error: "This client record has no login account. Portal setup is separate." }, { status: 409 });
  if (target.role !== "client") {
    return NextResponse.json({ error: "This only applies to client accounts." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const custom = typeof body.password === "string" ? body.password.trim() : "";
  if (custom && custom.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  const password = custom || generatePassword();
  const { error } = await svc.auth.admin.updateUserById(id, { password });
  if (error) {
    console.error("[set-password]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  console.log(`[set-password] owner ${user.email} set a temporary password for client ${target.email}`);
  return NextResponse.json({ ok: true, password, email: target.email, name: target.full_name });
}
