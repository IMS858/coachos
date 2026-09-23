import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: program } = await supabase.from("programs")
    .select("data,status,client_id").eq("id", id).maybeSingle();
  if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = ["owner", "trainer"].includes(profile?.role ?? "");
  if (!isStaff) {
    if (program.client_id !== user.id || !["published", "active", "completed"].includes(program.status)
      || program.data?.pdf_mode !== "client") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  const path = program.data?.pdf_storage_path;
  if (typeof path !== "string" || !path.startsWith(`${program.client_id}/${id}/`)
      || !/^[-\w/]+\.pdf$/.test(path)) {
    return NextResponse.json({ error: "No stored PDF" }, { status: 404 });
  }
  // Service credentials are used ONLY after user-scoped RLS and mode checks.
  const { data: file, error } = await createServiceClient().storage.from("ims-program-pdfs").download(path);
  if (error || !file) return NextResponse.json({ error: "PDF unavailable" }, { status: 404 });
  const bytes = await file.arrayBuffer();
  if (new Uint8Array(bytes).slice(0, 5).every((byte, i) => byte === [37, 80, 68, 70, 45][i]) === false) {
    return NextResponse.json({ error: "Invalid stored PDF" }, { status: 500 });
  }
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ims_plan.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
