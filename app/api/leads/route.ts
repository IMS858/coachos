import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** POST /api/leads — create a new lead manually */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const firstName = (body.first_name ?? "").trim();
  const lastName = (body.last_name ?? "").trim();
  const fullName = (body.full_name ?? `${firstName} ${lastName}`).trim();
  if (!fullName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("leads")
    .insert({
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      email: (body.email ?? "").trim().toLowerCase() || null,
      phone: (body.phone ?? "").trim() || null,
      interest: body.interest || null,
      stage: "new",
      source: "manual",
      notes: body.notes || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // unique index collision = duplicate
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A lead with this name and phone already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
