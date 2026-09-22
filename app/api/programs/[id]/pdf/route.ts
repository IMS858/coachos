import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: program } = await supabase.from("programs")
    .select("data,status").eq("id", id).maybeSingle();
  if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const encoded = program.data?.pdf_base64;
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
