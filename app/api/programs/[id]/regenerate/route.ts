import { NextResponse, type NextRequest } from "next/server";
import { generatorEndpoint } from "@/lib/programs/generator-endpoint";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Regenerate a client PDF from a coach-reviewed IMS draft, then save both atomically. */
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
  const { data: record, error: loadError } = await supabase.from("programs")
    .select("id,status,data,coach_edits,updated_at,pdf_client_url,client_id").eq("id", id).maybeSingle();
  if (loadError) return NextResponse.json({ error: "Unable to load draft" }, { status: 500 });
  if (!record || record.status !== "draft" || record.data?.source !== "ims_generator") {
    return NextResponse.json({ error: "Only generated drafts can be regenerated" }, { status: 409 });
  }
  const reviewed = record.coach_edits?.structured_program;
  if (!reviewed || !Array.isArray(reviewed.weeks) || !reviewed.weeks.length
    || reviewed.weeks.length > 8 || typeof reviewed.client_name !== "string"
    || !reviewed.assessment) {
    return NextResponse.json({ error: "No valid saved coach edits to render" }, { status: 400 });
  }
  const secret = process.env.PROGRAM_GENERATOR_SECRET;
  const endpoint = generatorEndpoint(process.env.PROGRAM_GENERATOR_URL, "render", process.env.NODE_ENV === "production");
  if (!secret || !endpoint) return NextResponse.json({ error: "Secure PDF renderer not configured" }, { status: 503 });
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${secret}` },
      body: JSON.stringify({ program: reviewed, pdf_mode: "client" }),
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    return NextResponse.json({ error: "PDF renderer unavailable" }, { status: 502 });
  }
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "Could not regenerate the reviewed PDF" }, { status: 502 });
  }
  const rendered = await response.json().catch(() => null);
  if (typeof rendered?.pdf_base64 !== "string" || rendered.pdf_base64.length > 7_000_000
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(rendered.pdf_base64)) {
    return NextResponse.json({ error: "Invalid regenerated PDF" }, { status: 502 });
  }
  const pdf = Buffer.from(rendered.pdf_base64, "base64");
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "Invalid PDF header" }, { status: 502 });
  }
  if (!record.client_id) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const storagePath = `${record.client_id}/${id}/reviewed-${crypto.randomUUID()}.pdf`;
  const svc = createServiceClient();
  const { error: uploadError } = await svc.storage.from("ims-program-pdfs")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
  if (uploadError) return NextResponse.json({ error: "Private PDF storage unavailable" }, { status: 503 });
  const { pdf_base64: _legacyPdf, ...safeRecordData } = record.data ?? {};
  const nextData = {
    ...safeRecordData,
    structured_program: reviewed,
    pdf_mode: "client",
    generated_at: new Date().toISOString(),
    reviewed_by: user.id,
    review_status: "ready_to_publish",
  };
  // Concurrency guard: a newer coach edit must never be overwritten by an older PDF.
  const { data: saved, error } = await supabase.from("programs")
    .update({ data: nextData, pdf_client_url: storagePath, coach_edits: {}, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "draft").eq("updated_at", record.updated_at)
    .select("id").maybeSingle();
  if (error || !saved) {
    await svc.storage.from("ims-program-pdfs").remove([storagePath]);
    return NextResponse.json({ error: error ? "Unable to save regenerated PDF" : "Draft changed during rendering; reload and retry" }, { status: error ? 500 : 409 });
  }
  // Keep the previous artifact until retention cleanup; existing links must
  // never break if another client request was already in flight.
  return NextResponse.json({ ok: true, program_id: id, pdf_url: `/api/programs/${id}/pdf` });
}
