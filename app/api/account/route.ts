import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/account — a signed-in user updates their OWN name and phone.
 *
 * Scoped to auth.uid() and to two fields only, so this can't be used to change
 * someone else's record, escalate a role, or edit the email that identifies
 * the account.
 */
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["full_name","phone"].includes(key))) return NextResponse.json({ error: "Unsupported account fields." }, { status: 400 });
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!fullName || fullName.length > 120) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (phone.length > 40) {
    return NextResponse.json({ error: "That phone number looks too long." }, { status: 400 });
  }

  const { data: me, error: profileError } = await supabase.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: "Account authorization unavailable." }, { status: 503 });
  if (!me || me.deleted_at || me.role !== "client") return NextResponse.json({ error: "Client account required." }, { status: 403 });
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
