import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireOwner(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 as const };
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.role !== "owner")
    return { error: "Owner only", status: 403 as const };
  return { user };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireOwner(supabase);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  const monthly = Math.round(Number(body.monthly_rent ?? 0) * 100);

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!Number.isFinite(monthly) || monthly < 0) {
    return NextResponse.json({ error: "Invalid rent" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("renters")
    .insert({
      name,
      discipline: body.discipline ?? null,
      monthly_rent_cents: monthly,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not add renter", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, id: data.id });
}
