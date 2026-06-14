import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/services — create a new service in the catalog (owner only).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    name,
    description,
    category = "recovery",
    duration_minutes,
    member_included = true,
    drop_in_eligible = true,
    drop_in_price_cents,
    active = true,
  } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Slug from name: "Cold Plunge" -> "cold_plunge"
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // Find next display_order
  const { data: maxRow } = await supabase
    .from("service_catalog")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.display_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("service_catalog")
    .insert({
      slug,
      name: name.trim(),
      description: description?.trim() || null,
      category,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      member_included,
      drop_in_eligible,
      drop_in_price_cents: drop_in_price_cents
        ? Math.round(Number(drop_in_price_cents))
        : null,
      active,
      display_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    const friendly = error.message.includes("duplicate")
      ? `A service with the slug "${slug}" already exists. Pick a different name.`
      : error.message;
    return NextResponse.json(
      { error: "Could not create service", detail: friendly },
      { status: 500 }
    );
  }

  return NextResponse.json({ service: data }, { status: 201 });
}
