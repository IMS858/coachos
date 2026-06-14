import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/generate
 *
 * Body: { assessment_id: string }
 *
 * 1. Load the assessment (RLS scopes to current trainer/owner)
 * 2. POST assessment.data to the Python service
 * 3. Save returned Program to programs table
 * 4. Return the new program ID
 *
 * The Python service is the same Flask app from ims-fresh-repo.zip, deployed
 * to Railway. It expects the Assessment JSON shape unchanged.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assessment_id } = await request.json();
  if (!assessment_id) {
    return NextResponse.json(
      { error: "assessment_id required" },
      { status: 400 }
    );
  }

  // Load assessment (RLS: must be trainer/owner)
  const { data: assessment, error: assessErr } = await supabase
    .from("assessments")
    .select("id, client_id, data")
    .eq("id", assessment_id)
    .single();

  if (assessErr || !assessment) {
    return NextResponse.json(
      { error: "Assessment not found or no access" },
      { status: 404 }
    );
  }

  // Call Python service
  const generatorUrl = process.env.PYTHON_GENERATOR_URL;
  if (!generatorUrl) {
    return NextResponse.json(
      { error: "Generator service not configured" },
      { status: 503 }
    );
  }

  let programData;
  try {
    const genRes = await fetch(`${generatorUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...((assessment.data as object) ?? {}),
        // The Python service expects the assessment fields at the top level.
        // It also accepts a `mode` parameter for client/coach/full PDF rendering,
        // but for JSON-only generation we omit it.
      }),
      // 30 second timeout — the generator usually responds in ~2s
      signal: AbortSignal.timeout(30000),
    });

    if (!genRes.ok) {
      const errBody = await genRes.text();
      return NextResponse.json(
        { error: "Generator failed", detail: errBody },
        { status: 502 }
      );
    }

    programData = await genRes.json();
  } catch (err: any) {
    return NextResponse.json(
      { error: "Generator unreachable", detail: String(err?.message ?? err) },
      { status: 502 }
    );
  }

  // Save the generated program as a draft
  const { data: program, error: progErr } = await supabase
    .from("programs")
    .insert({
      client_id: assessment.client_id,
      assessment_id: assessment.id,
      trainer_id: user.id,
      name: `Program — ${new Date().toLocaleDateString("en-US")}`,
      weeks: 4,
      status: "draft",
      data: programData,
    })
    .select("id")
    .single();

  if (progErr) {
    return NextResponse.json(
      { error: "Failed to save program", detail: progErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, program_id: program.id });
}
