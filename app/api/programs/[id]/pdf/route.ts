import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: program } = await supabase.from("programs")
    .select("data,status,pdf_client_url,pdf_coach_url,client_id").eq("id", id).maybeSingle();
  if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = ["owner", "trainer"].includes(profile?.role ?? "");
  if (!isStaff && (program.client_id !== user.id || !["published", "active", "completed"].includes(program.status))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const pdfPath = isStaff && program.data?.pdf_mode === "coach"
    ? program.pdf_coach_url : program.pdf_client_url;
  // A coach draft may have pdf_mode=coach; clients must still receive the
  // separately published, sanitized client PDF, never the coach artifact.
  if (!isStaff && !program.pdf_client_url) {
    return NextResponse.json({ error: "No published client PDF" }, { status: 404 });
  }
  if (typeof pdfPath === "string" && pdfPath.length > 0) {
    const svc = createServiceClient();
    const { data: stored, error } = await svc.storage.from("ims-program-pdfs").download(pdfPath);
    if (error || !stored) return NextResponse.json({ error: "Stored PDF unavailable" }, { status: 404 });
    const bytes = Buffer.from(await stored.arrayBuffer());
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return NextResponse.json({ error: "Invalid stored PDF" }, { status: 500 });
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="ims_plan.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  }
  // Read-only compatibility for legacy drafts created before private storage.
  const encoded = isStaff ? program.data?.pdf_base64 : null;
  if (typeof encoded !== "string" || encoded.length > 7_000_000) {
    return NextResponse.json({ error: "No stored PDF" }, { status: 404 });
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "Invalid PDF" }, { status: 500 });
  }
  return new NextResponse(new Uint8Array(bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ims_plan.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
