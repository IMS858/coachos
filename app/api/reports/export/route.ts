import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** GET /api/reports/export?type=members|sessions */
export async function GET(request: NextRequest) {
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
  if (me?.role !== "owner") {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "members";
  const svc = createServiceClient();

  function toCsv(headers: string[], rows: (string | number | null)[][]): string {
    const esc = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  }

  let csv = "";
  let filename = "export.csv";

  if (type === "members") {
    const { data } = await svc
      .from("profiles")
      .select("full_name, phone, role, created_at")
      .eq("role", "client")
      .order("full_name", { ascending: true });
    csv = toCsv(
      ["Name", "Phone", "Role", "Joined"],
      (data ?? []).map((m) => [
        m.full_name,
        m.phone,
        m.role,
        m.created_at ? new Date(m.created_at).toLocaleDateString() : "",
      ])
    );
    filename = "members.csv";
  } else if (type === "sessions") {
    const { data } = await svc
      .from("sessions")
      .select("scheduled_at, session_type, status, duration_minutes, location")
      .order("scheduled_at", { ascending: false })
      .limit(2000);
    csv = toCsv(
      ["Date", "Type", "Status", "Minutes", "Location"],
      (data ?? []).map((s) => [
        s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "",
        s.session_type,
        s.status,
        s.duration_minutes,
        s.location,
      ])
    );
    filename = "sessions.csv";
  } else {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
