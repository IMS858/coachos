import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fourWeekStructureIssues } from "@/lib/programs/four-week-integrity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Move internal generator data to staff-only storage before client publication. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "trainer"].includes(profile.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }
  const { data: record, error: readError } = await supabase.from("programs")
    .select("id,client_id,status,data,coach_edits,request_payload,updated_at,pdf_client_url")
    .eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to read draft" }, { status: 500 });
  if (!record || record.status !== "draft" || record.data?.source !== "ims_generator") {
    return NextResponse.json({ error: "Generated draft not found" }, { status: 409 });
  }
  if (record.data.pdf_mode !== "client" || record.data.review_status !== "ready_to_publish"
      || !record.pdf_client_url?.startsWith(`${record.client_id}/${id}/`)
      || !record.data.structured_program || (record.coach_edits && Object.keys(record.coach_edits).length)) {
    return NextResponse.json({ error: "Regenerate a reviewed client PDF and resolve all edits before publishing" }, { status: 409 });
  }
  // A successful development build does not authorize client release.
  // This flag must be enabled only after the quarantined PDF suites, canonical
  // crosswalk, safety reviews and signed release checklist are complete.
  if (process.env.IMS_GENERATOR_CLIENT_RELEASE_APPROVED !== "true") {
    return NextResponse.json({ error: "IMS generator client release is awaiting safety and regression sign-off" }, { status: 409 });
  }
  const [{ data: mappings, error: mappingError }, { data: reviews, error: reviewError }] = await Promise.all([
    supabase.from("canonical_exercise_queue").select("canonical_id,matched_exercise_id,mapping_status").limit(1000),
    supabase.from("exercise_reviews").select("exercise_id,safety_status").limit(1000),
  ]);
  const approvedIds = new Set((reviews ?? []).filter(r => r.safety_status === "approved").map(r => r.exercise_id));
  if (mappingError || reviewError || !mappings || mappings.length !== 423 ||
    mappings.some(m => m.mapping_status !== "coach_confirmed" || !m.matched_exercise_id ||
      !approvedIds.has(m.matched_exercise_id))) {
    return NextResponse.json({ error: "Canonical exercise mapping and safety review are incomplete" }, { status: 409 });
  }
  const structureIssues = fourWeekStructureIssues(record.data.structured_program);
  if (structureIssues.length) {
    return NextResponse.json({ error: "Four-week program is incomplete; regenerate and review before publishing", issues: structureIssues.slice(0, 10) }, { status: 422 });
  }
  const svc = createServiceClient();
  // Confirm the private artifact exists before exposing the published download.
  const { data: files, error: fileError } = await svc.storage.from("ims-program-pdfs")
    .list(`${record.client_id}/${id}`, { limit: 100 });
  if (fileError || !files?.some(file => `${record.client_id}/${id}/${file.name}` === record.pdf_client_url)) {
    return NextResponse.json({ error: "Reviewed client PDF is missing" }, { status: 409 });
  }
  const { error: archiveError } = await svc.from("program_coach_artifacts").upsert({
    program_id: id,
    structured_program: record.data.structured_program,
    assessment_summary: record.data.assessment_summary ?? {},
    request_payload: record.request_payload ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "program_id" });
  if (archiveError) return NextResponse.json({ error: "Private coach archive is not configured" }, { status: 503 });
  // Only this allowlisted projection becomes readable to the client.
  const safeData = {
    source: "ims_generator",
    pdf_mode: "client",
    pdf_storage_path: record.data.pdf_storage_path,
    generated_at: record.data.generated_at,
    review_status: "published",
    generator_version: record.data.generator_version,
    contract_version: record.data.contract_version,
  };
  const { data: saved, error: saveError } = await supabase.from("programs")
    .update({
      status: "published", published_at: new Date().toISOString(),
      data: safeData, coach_edits: {}, request_payload: null,
      objective_summary: null, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("status", "draft").eq("updated_at", record.updated_at)
    .select("id").maybeSingle();
  if (saveError || !saved) {
    return NextResponse.json({ error: saveError ? "Unable to publish" : "Draft changed during publication; refresh and retry" }, { status: saveError ? 500 : 409 });
  }
  await recordAudit({actorId:user.id,action:"program.published",entityType:"program",entityId:id,changes:{client_id:record.client_id,source:"ims_generator"}});
  return NextResponse.json({ ok: true, program_id: id });
}
