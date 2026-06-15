import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/clients/[id]/plans
 *
 * Creates a new plan (subscription or package) for the client.
 * Trainer/owner only.
 *
 * Audit 2 update: now detects Postgres unique-violation (code 23505) on the
 * one-active-subscription-per-client constraint and returns a clear 409 instead
 * of a generic 500.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await context.params;
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

  const body = await request.json().catch(() => ({}));

  if (!["subscription", "package"].includes(body.kind)) {
    return NextResponse.json(
      { error: "kind must be 'subscription' or 'package'" },
      { status: 400 }
    );
  }
  if (!body.tier) {
    return NextResponse.json({ error: "tier required" }, { status: 400 });
  }

  if (body.kind === "subscription") {
    if (!body.monthly_rate_cents || body.monthly_rate_cents <= 0) {
      return NextResponse.json(
        { error: "monthly_rate_cents required for subscriptions" },
        { status: 400 }
      );
    }
    if (body.tier === "custom" && !body.custom_label?.trim()) {
      return NextResponse.json(
        { error: "custom_label required for custom subscriptions" },
        { status: 400 }
      );
    }
  } else {
    if (!body.service_type || !["training", "massage", "pilates"].includes(body.service_type)) {
      return NextResponse.json(
        { error: "service_type must be training, massage, or pilates" },
        { status: 400 }
      );
    }
    if (!body.total_sessions || body.total_sessions <= 0) {
      return NextResponse.json(
        { error: "total_sessions required for packages" },
        { status: 400 }
      );
    }
  }

  const insert: any = {
    client_id: clientId,
    kind: body.kind,
    tier: body.tier,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
  };

  if (body.kind === "subscription") {
    insert.monthly_rate_cents = body.monthly_rate_cents;
    if (body.sessions_per_week) insert.sessions_per_week = body.sessions_per_week;
    if (body.custom_label) insert.custom_label = body.custom_label.trim();
  } else {
    insert.service_type = body.service_type;
    insert.total_sessions = body.total_sessions;
    insert.current_session_number = body.current_session_number ?? 0;
    insert.sessions_used = body.sessions_used ?? body.current_session_number ?? 0;
    if (body.package_total_cents) insert.package_total_cents = body.package_total_cents;
  }

  const { data: plan, error } = await supabase
    .from("plans")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation (Postgres SQLSTATE)
    // The unique partial index from migration 0007 prevents two active
    // subscriptions on the same client.
    if ((error as any).code === "23505") {
      return NextResponse.json(
        {
          error:
            "This client already has an active subscription. Cancel it first, or add a package instead.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create plan", detail: error.message },
      { status: 500 }
    );
  }

  // Update billing_type to reflect current state
  const { data: existingSubs } = await supabase
    .from("plans")
    .select("id")
    .eq("client_id", clientId)
    .eq("kind", "subscription")
    .eq("status", "active")
    .limit(1);
  const billingType =
    existingSubs && existingSubs.length > 0 ? "membership" : "package";
  await supabase
    .from("clients")
    .update({ billing_type: billingType })
    .eq("id", clientId);

  return NextResponse.json({ ok: true, plan });
}
