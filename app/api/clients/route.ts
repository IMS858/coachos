import { type NextRequest, NextResponse } from "next/server";
import {
  createClient as createServerClient,
  createServiceClient,
} from "@/lib/supabase/server";

/**
 * POST /api/clients
 *
 * Creates a new client end-to-end:
 *   1. Auth user (admin API)
 *   2. Profile row (auto-created via trigger; we update full_name + role)
 *   3. Clients row
 *   4. Optional initial plan
 *
 * Trainer/owner only.
 *
 * Body:
 *   {
 *     full_name: string (required),
 *     email: string (required),
 *     phone?: string,
 *     status?: 'lead' | 'active' (default: 'active'),
 *     initial_plan?: {
 *       kind: 'subscription' | 'package',
 *       tier: string,
 *       service_type?: 'training' | 'massage' | 'pilates',
 *       custom_label?: string,
 *       monthly_rate_cents?: number,
 *       sessions_per_week?: number,
 *       total_sessions?: number,
 *       current_session_number?: number,
 *       package_total_cents?: number,
 *     }
 *   }
 *
 * Returns: { client_id }
 */
export async function POST(request: NextRequest) {
  // 1. Verify caller is trainer/owner
  const supabaseUser = await createServerClient();
  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseUser
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // 2. Validate
  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  if (!fullName) {
    return NextResponse.json({ error: "Full name required" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  const status = body.status === "lead" ? "lead" : "active";

  // Use service-role for the user-creation step (regular auth.admin requires service role)
  const supabase = createServiceClient();

  // 3. Check for existing email
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "A client with this email already exists" },
      { status: 409 }
    );
  }

  // 4. Create auth user (trigger creates profile row)
  const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !authData.user) {
    return NextResponse.json(
      {
        error: "Could not create auth user",
        detail: authError?.message ?? "no user returned",
      },
      { status: 500 }
    );
  }

  const newUserId = authData.user.id;

  // 5. Update profile (trigger sets defaults; we set full_name + phone + role)
  await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: body.phone || null,
      role: "client",
    })
    .eq("id", newUserId);

  // 6. Create clients row
  const billingType = body.initial_plan
    ? body.initial_plan.kind === "subscription"
      ? "membership"
      : "package"
    : "unset";

  const { error: clientErr } = await supabase.from("clients").insert({
    id: newUserId,
    status,
    billing_type: billingType,
    joined_at: status === "active" ? new Date().toISOString() : null,
    primary_trainer_id: user.id,
  });

  if (clientErr) {
    // Roll back the auth user if the client insert failed
    await supabase.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: "Could not create client", detail: clientErr.message },
      { status: 500 }
    );
  }

  // 7. Optional: initial plan
  if (body.initial_plan) {
    const ip = body.initial_plan;
    const planInsert: any = {
      client_id: newUserId,
      kind: ip.kind,
      tier: ip.tier,
      status: "active",
      start_date: new Date().toISOString().slice(0, 10),
    };

    if (ip.kind === "subscription") {
      if (!ip.monthly_rate_cents || ip.monthly_rate_cents <= 0) {
        return NextResponse.json(
          { error: "monthly_rate_cents required for initial subscription" },
          { status: 400 }
        );
      }
      planInsert.monthly_rate_cents = ip.monthly_rate_cents;
      if (ip.sessions_per_week) planInsert.sessions_per_week = ip.sessions_per_week;
      if (ip.tier === "custom") {
        if (!ip.custom_label?.trim()) {
          return NextResponse.json(
            { error: "custom_label required for custom subscription" },
            { status: 400 }
          );
        }
        planInsert.custom_label = ip.custom_label.trim();
      }
    } else {
      if (!ip.service_type || !["training", "massage", "pilates"].includes(ip.service_type)) {
        return NextResponse.json(
          { error: "service_type must be training/massage/pilates" },
          { status: 400 }
        );
      }
      if (!ip.total_sessions || ip.total_sessions <= 0) {
        return NextResponse.json(
          { error: "total_sessions required for package" },
          { status: 400 }
        );
      }
      planInsert.service_type = ip.service_type;
      planInsert.total_sessions = ip.total_sessions;
      planInsert.current_session_number = ip.current_session_number ?? 0;
      planInsert.sessions_used = ip.current_session_number ?? 0;
      if (ip.package_total_cents) planInsert.package_total_cents = ip.package_total_cents;
    }

    const { error: planErr } = await supabase.from("plans").insert(planInsert);
    if (planErr) {
      // Don't roll back the client — they exist, just with no plan. Surface the error.
      return NextResponse.json(
        {
          ok: true,
          client_id: newUserId,
          warning: `Client created but plan failed: ${planErr.message}. Add the plan from their profile.`,
        },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ ok: true, client_id: newUserId });
}
