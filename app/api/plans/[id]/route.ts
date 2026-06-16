import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/plans/[id]
 *
 * Edit a plan. Allow-listed fields:
 *   - current_session_number / sessions_used (counter adjust)
 *   - custom_label / monthly_rate_cents (custom plan rename + reprice)
 *   - notes
 *   - status: 'active' | 'paused' | 'cancelled'  (used by the Reactivate flow)
 *
 * Audit 2 update: handles the unique-violation case when reactivating a
 * subscription while another active sub exists on the same client.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const allowed: Record<string, unknown> = {};
  if (body.current_session_number !== undefined)
    allowed.current_session_number = body.current_session_number;
  if (body.sessions_used !== undefined) allowed.sessions_used = body.sessions_used;
  if (body.custom_label !== undefined) allowed.custom_label = body.custom_label;
  if (body.monthly_rate_cents !== undefined)
    allowed.monthly_rate_cents = body.monthly_rate_cents;
  if (body.notes !== undefined) allowed.notes = body.notes;
  if (body.status !== undefined && ["active", "paused", "cancelled"].includes(body.status)) {
    allowed.status = body.status;
    // If reactivating, clear the end_date
    if (body.status === "active") {
      allowed.end_date = null;
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { error } = await supabase.from("plans").update(allowed).eq("id", id);
  if (error) {
    if ((error as any).code === "23505") {
      return NextResponse.json(
        {
          error:
            "Can't reactivate — this client already has an active subscription. Cancel that one first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Update failed", detail: error.message },
      { status: 500 }
    );
  }

  // Recompute billing_type if status changed (since reactivation can flip the type)
  if (body.status !== undefined) {
    const { data: plan } = await supabase
      .from("plans")
      .select("client_id")
      .eq("id", id)
      .single();
    if (plan?.client_id) {
      await recomputeBillingType(supabase, plan.client_id);
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/plans/[id]
 *
 * Soft-cancel a plan. Sets status='cancelled', end_date=today.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
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

  const { data: plan } = await supabase
    .from("plans")
    .select("client_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("plans")
    .update({
      status: "cancelled",
      end_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Cancel failed", detail: error.message },
      { status: 500 }
    );
  }

  if (plan?.client_id) {
    await recomputeBillingType(supabase, plan.client_id);
  }

  return NextResponse.json({ ok: true });
}

async function recomputeBillingType(supabase: any, clientId: string) {
  const { data: remaining } = await supabase
    .from("plans")
    .select("kind")
    .eq("client_id", clientId)
    .eq("status", "active");

  let billingType = "unset";
  if (remaining && remaining.length > 0) {
    const hasSub = remaining.some((p: any) => p.kind === "subscription");
    billingType = hasSub ? "membership" : "package";
  }
  await supabase
    .from("clients")
    .update({ billing_type: billingType })
    .eq("id", clientId);
}
