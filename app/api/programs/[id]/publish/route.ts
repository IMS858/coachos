import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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
    .select("id,client_id,status,data,coach_edits,request_payload,updated_at")
    .eq("id", id).maybeSingle();
  if (readError) return NextResponse.json({ error: "Unable to read draft" }, { status: 500 });
  if (!record || record.status !== "draft" || record.data?.source !== "ims_generator") {
    return NextResponse.json({ error: "Generated draft not found" }, { status: 409 });
  }
  if (record.data.pdf_mode !== "client" || record.data.review_status !== "ready_to_publish"
      || !record.data.pdf_storage_path?.startsWith(`${record.client_id}/${id}/`)
      || !record.data.structured_program || (record.coach_edits && Object.keys(record.coach_edits).length)) {
    return NextResponse.json({ error: "Regenerate a reviewed client PDF and resolve all edits before publishing" }, { status: 409 });
  }
  const svc = createServiceClient();
  // Confirm the private artifact exists before exposing the published download.
  const { data: files, error: fileError } = await svc.storage.from("ims-program-pdfs")
    .list(`${record.client_id}/${id}`, { limit: 100 });
  if (fileError || !files?.some(file => `${record.client_id}/${id}/${file.name}` === record.data.pdf_storage_path)) {
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
  return NextResponse.json({ ok: true, program_id: id });
}
