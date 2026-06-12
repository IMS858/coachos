import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/command/search?q=nik
 *
 * Powers the ⌘K command palette. Returns up to 8 clients whose name
 * matches the query. Trainer/owner only.
 *
 * Uses the *user-scoped* Supabase client deliberately — RLS applies,
 * so this endpoint can never leak rows the caller couldn't already see.
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

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 64);
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Escape LIKE wildcards so "100%" doesn't become a match-everything query
  const escaped = q.replace(/[%_]/g, (m) => `\\${m}`);

  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, status")
    .ilike("full_name", `%${escaped}%`)
    .order("full_name")
    .limit(8);

  if (error) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json({
    results: (data ?? []).map((c) => ({
      id: c.id,
      name: c.full_name,
      status: c.status,
    })),
  });
}
