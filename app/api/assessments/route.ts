import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/assessments — create a draft assessment (staff only).
 * Body: { client_id, data?, section_status? }
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
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { client_id, data = {}, section_status = {} } = body;
  if (!client_id) {
    return NextResponse.json({ error: "client_id required" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("assessments")
    .insert({
      client_id,
      trainer_id: user.id,
      data,
      section_status,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not create assessment", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: row.id }, { status: 201 });
}
