import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role, deleted_at").eq("id", user.id).maybeSingle();
  if (!me || me.deleted_at || !["owner","trainer"].includes(me.role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const archived = body.archived !== false;
  const svc = createServiceClient();
  const { error } = await svc.from("message_thread_state").upsert({
    client_id: clientId,
    archived_at: archived ? new Date().toISOString() : null,
    archived_by: archived ? user.id : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" });
  if (error) return NextResponse.json({ error: "Inbox state unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true, archived });
}
