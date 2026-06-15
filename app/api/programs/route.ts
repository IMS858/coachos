import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/programs?status=active|all
 *
 * Returns programs visible to the caller. Trainer/owner only — clients see
 * their own programs through a different path.
 *
 * Response: { programs: [{ id, name, client_name, status }] }
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "active";

  let query = supabase
    .from("programs")
    .select(
      `id, name, status,
       clients!inner(profiles!inner(full_name))`
    )
    .order("created_at", { ascending: false });

  if (statusFilter === "active") {
    query = query.in("status", ["draft", "published", "active"]);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Could not load programs", detail: error.message },
      { status: 500 }
    );
  }

  const programs = (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    client_name: p.clients?.profiles?.full_name ?? "—",
  }));

  return NextResponse.json({ programs });
}
