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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!fullName || fullName.length > 120) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (phone.length > 40) {
    return NextResponse.json({ error: "That phone number looks too long." }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: phone || null } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
