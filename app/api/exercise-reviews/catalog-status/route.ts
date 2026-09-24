import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Read-only owner audit of the canonical source catalog and live exercise library.
 * Counts are deliberately separate: owner source familiarity, verified identity
 * mappings, safety metadata completeness, and client publication are not interchangeable.
 */
export async function GET() {
  const supabase = await createClient();
  const {data: {user}, error: authError} = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({error: "Authentication required"}, {status: 401});

  const {data: profile, error: profileError} = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || profile?.role !== "owner") {
    return NextResponse.json({error: "Owner access required"}, {status: 403});
  }

  const [canonical, confirmed, pending, library, visible, missingJoints, attestation] = await Promise.all([
    supabase.from("canonical_exercise_queue").select("canonical_id", {count: "exact", head: true}),
    supabase.from("canonical_exercise_queue").select("canonical_id", {count: "exact", head: true}).eq("mapping_status", "coach_confirmed"),
    supabase.from("canonical_exercise_queue").select("canonical_id", {count: "exact", head: true}).eq("mapping_status", "pending"),
    supabase.from("exercises").select("id", {count: "exact", head: true}),
    supabase.from("exercises").select("id", {count: "exact", head: true}).eq("client_visible", true),
    supabase.from("exercises").select("id", {count: "exact", head: true}).or("primary_joints.is.null,primary_joints.eq.{}"),
    supabase.from("exercise_catalog_attestations").select("reviewed_count,reviewed_at,scope")
      .eq("reviewed_by", user.id).order("reviewed_at", {ascending: false}).limit(1).maybeSingle(),
  ]);

  const results = [canonical, confirmed, pending, library, visible, missingJoints, attestation];
  if (results.some(result => result.error)) {
    console.error("Exercise catalog audit query failed", results.map(result => result.error?.code ?? null));
    return NextResponse.json({error: "Unable to verify the complete exercise catalog"}, {status: 503});
  }

  const sourceCount = canonical.count ?? 0;
  const mappedCount = confirmed.count ?? 0;
  const pendingCount = pending.count ?? 0;
  const attestedCount = attestation.data?.reviewed_count ?? 0;

  return NextResponse.json({
    canonical_source: {
      total: sourceCount,
      owner_attested_count: attestedCount,
      owner_attested_at: attestation.data?.reviewed_at ?? null,
      attestation_scope: attestation.data?.scope ?? null,
      confirmed_library_matches: mappedCount,
      pending_library_matches: pendingCount,
      accounting_complete: mappedCount + pendingCount === sourceCount,
    },
    exercise_library: {
      total: library.count ?? 0,
      client_visible: visible.count ?? 0,
      missing_primary_joint_metadata: missingJoints.count ?? 0,
    },
    release: {
      source_attestation_is_safety_clearance: false,
      verified_mapping_required: true,
      exercise_specific_safety_review_required: true,
      client_release_automatically_enabled: false,
    },
  }, {headers: {"Cache-Control": "private, no-store"}});
}
