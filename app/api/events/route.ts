import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/events — record one usage event for the signed-in user.
 *
 * Deliberately minimal: which page, when, and an optional id. No IP, no user
 * agent, no fingerprinting. The purpose is spotting a client who has gone
 * quiet, not building a profile of them.
 *
 * Never fails loudly — a tracking hiccup must not surface to a client.
 */
const ALLOWED = new Set(["open", "view", "watch", "book", "message"]);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true }); // silently ignore

    const b = await request.json().catch(() => ({}));
    const event = String(b.event ?? "view");
    if (!ALLOWED.has(event)) return NextResponse.json({ ok: true });

    const { data: me } = await supabase
      .from("profiles").select("role").eq("id", user.id).maybeSingle();

    await supabase.from("app_events").insert({
      user_id: user.id,
      role: (me as any)?.role ?? null,
      event,
      path: String(b.path ?? "").slice(0, 200) || null,
      meta: b.meta && typeof b.meta === "object" ? b.meta : null,
    } as never);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
