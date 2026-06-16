import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/generate
 * Translates Coach OS assessment data → IMS program-generator format,
 * calls the external Python generator, returns a PDF or stores program data.
 *
 * The generator at PROGRAM_GENERATOR_URL uses 838 real exercises,
 * the exact IMS methodology, FRA priority rotation, and Katch-McArdle nutrition.
 * It runs in seconds — no AI timeout risk.
 */

const GENERATOR_URL =
  process.env.PROGRAM_GENERATOR_URL || "https://program-generator-rho.vercel.app";

/** Map Coach OS joint rating to constraint/concern flags. */
function mapConstraints(data: any): { constraints: string[]; concerns: string[]; concernNotes: string } {
  const constraints: string[] = [];
  const concerns: string[] = [];
  const notes: string[] = [];

  const pm = data.pain_map ?? {};
  const health = data.health ?? {};

  // Pain map → concerns
  if (pm.low_back?.severity && Number(pm.low_back.severity) >= 4) {
    concerns.push("lower_back");
    constraints.push("SI_joint_sensitivity");
    if (Number(pm.low_back.severity) >= 6) constraints.push("no_axial_loading");
  }
  if (pm.left_knee?.severity && Number(pm.left_knee.severity) >= 3) concerns.push("bad_knee");
  if (pm.right_knee?.severity && Number(pm.right_knee.severity) >= 3) concerns.push("bad_knee");
  if (pm.left_shoulder?.severity && Number(pm.left_shoulder.severity) >= 3) concerns.push("bad_shoulder");
  if (pm.right_shoulder?.severity && Number(pm.right_shoulder.severity) >= 3) concerns.push("bad_shoulder");
  if (pm.left_hip?.severity && Number(pm.left_hip.severity) >= 3) concerns.push("hip");
  if (pm.right_hip?.severity && Number(pm.right_hip.severity) >= 3) concerns.push("hip");
  if (pm.neck_cervical?.severity && Number(pm.neck_cervical.severity) >= 3) concerns.push("neck");
  if (pm.left_wrist?.severity && Number(pm.left_wrist.severity) >= 3) concerns.push("wrist");
  if (pm.right_wrist?.severity && Number(pm.right_wrist.severity) >= 3) concerns.push("wrist");
  if (pm.left_ankle?.severity && Number(pm.left_ankle.severity) >= 3) concerns.push("ankle");
  if (pm.right_ankle?.severity && Number(pm.right_ankle.severity) >= 3) concerns.push("ankle");

  // Health history → constraints
  if (health.surgeries) {
    const s = health.surgeries.toLowerCase();
    if (s.includes("knee")) constraints.push("post_surgery_knee");
    if (s.includes("shoulder")) constraints.push("post_surgery_shoulder");
    if (s.includes("hip")) constraints.push("post_surgery_hip");
  }

  // Build concern notes from pain descriptions + health notes
  for (const [area, val] of Object.entries(pm) as [string, any][]) {
    if (val?.severity && Number(val.severity) > 0 && val.description) {
      notes.push(`${area.replace(/_/g, " ")}: ${val.severity}/10 — ${val.description}`);
    }
  }
  if (health.notes) notes.push(health.notes);
  if (health.injuries_current) notes.push(`Current: ${health.injuries_current}`);

  return { constraints: [...new Set(constraints)], concerns: [...new Set(concerns)], concernNotes: notes.join(". ") };
}

/** Map Coach OS movement screen → FRA priorities (limited/painful joints). */
function mapFRAPriorities(screen: any): string[] {
  const priorities: string[] = [];
  const jointMap: Record<string, string> = {
    hips: "Hip IR L+R",
    shoulders: "Shoulder ER L+R",
    t_spine: "Thoracic Extension",
    ankles: "Ankle Dorsiflexion L+R",
    neck: "Cervical Rotation L+R",
    wrists: "Wrist Extension L+R",
    knees: "Knee Flexion L+R",
  };

  for (const [joint, val] of Object.entries(screen ?? {}) as [string, any][]) {
    if (val?.rating === "limited" || val?.rating === "painful") {
      const mapped = jointMap[joint];
      if (mapped) priorities.push(mapped);
    }
  }
  return priorities.slice(0, 5); // Top 5
}

/** Map Coach OS movement screen → mobility_map for the generator. */
function mapMobilityMap(screen: any): any[] {
  const ratings: any[] = [];
  const jointDirections: Record<string, string[]> = {
    hips: ["IR", "ER", "Flexion", "Extension"],
    shoulders: ["Flexion", "ER", "IR"],
    t_spine: ["Rotation", "Extension"],
    ankles: ["Dorsiflexion"],
    neck: ["Rotation", "Flexion"],
    knees: ["Flexion"],
    wrists: ["Extension", "Flexion"],
  };

  for (const [joint, val] of Object.entries(screen ?? {}) as [string, any][]) {
    const dirs = jointDirections[joint] ?? [];
    for (const dir of dirs) {
      ratings.push({
        joint: joint.replace(/_/g, " "),
        direction: dir,
        side: "bilateral",
        rating: val?.rating === "good" ? "green" : val?.rating === "limited" ? "yellow" : val?.rating === "painful" ? "red" : "not_tested",
      });
    }
  }
  return ratings;
}

/** Map Coach OS strength baseline → strength_marker_results. */
function mapStrengthResults(baseline: any): Record<string, string> {
  const results: Record<string, string> = {};
  for (const [pattern, val] of Object.entries(baseline ?? {}) as [string, any][]) {
    if (val?.load) {
      results[pattern] = val.load;
    }
  }
  return results;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const assessmentId = body.assessment_id;
  if (!assessmentId) {
    return NextResponse.json({ error: "assessment_id required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: assessment } = await svc
    .from("assessments")
    .select("id, client_id, data")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const { data: clientProfile } = await svc
    .from("profiles")
    .select("full_name")
    .eq("id", assessment.client_id)
    .maybeSingle();

  const a = (assessment.data as any) ?? {};
  const goals = a.goals ?? {};
  const health = a.health ?? {};
  const screen = a.movement_screen ?? {};
  const strength = a.strength_baseline ?? {};
  const lifestyle = a.lifestyle ?? {};
  const bodyComp = a.body_comp ?? {};
  const conditioning = a.conditioning ?? {};
  const summary = a.summary ?? {};

  const sessionsPerWeek = summary.recommended_sessions_per_week || goals.target_sessions_per_week || 3;
  const { constraints, concerns, concernNotes } = mapConstraints(a);
  const fraPriorities = mapFRAPriorities(screen);
  const mobilityMap = mapMobilityMap(screen);
  const strengthResults = mapStrengthResults(strength);

  // Build background string from lifestyle + training history
  const bgParts = [
    goals.training_history,
    lifestyle.occupation && `works as ${lifestyle.occupation}`,
    lifestyle.desk_hours && `${lifestyle.desk_hours}hrs at desk`,
    lifestyle.sleep_quality && `sleep: ${lifestyle.sleep_quality}`,
    lifestyle.stress_level && `stress: ${lifestyle.stress_level}`,
  ].filter(Boolean);

  // Build body comp for nutrition calculation
  const bc: Record<string, string> = {};
  if (bodyComp.weight_lbs) bc.weight = `${bodyComp.weight_lbs} lbs`;
  if (bodyComp.body_fat_pct) bc.body_fat = `${bodyComp.body_fat_pct}%`;
  if (bodyComp.lean_mass_lbs) bc.lean_mass = `${bodyComp.lean_mass_lbs} lbs`;

  // Translate to program-generator format
  const generatorPayload = {
    client_name: clientProfile?.full_name ?? "Client",
    age_range: "",
    sex: "",
    background: bgParts.join(". ") || "",
    strength_days: Math.min(sessionsPerWeek, 4),
    cardio_days: sessionsPerWeek > 3 ? 1 : 0,
    primary_goal: goals.primary || "General strength and movement quality",
    fra_priorities: fraPriorities,
    mobility_map: mobilityMap,
    strength_markers: [],
    strength_marker_results: strengthResults,
    constraints,
    concerns,
    concern_notes: concernNotes,
    body_comp: Object.keys(bc).length > 0 ? bc : {},
    activity_factor: 1.45,
    nutrition_strategy: goals.primary?.toLowerCase().includes("lose") || goals.primary?.toLowerCase().includes("fat") ? "fat_loss" : "maintenance",
    coach_notes: [summary.recommendation, summary.focus_areas, summary.red_flags].filter(Boolean).join(". "),
    pdf_mode: body.pdf_mode || "client",
  };

  const started = Date.now();
  try {
    console.log("[generate] calling IMS generator at", GENERATOR_URL);
    const res = await fetch(`${GENERATOR_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/pdf",
      },
      body: JSON.stringify(generatorPayload),
      signal: AbortSignal.timeout(55000),
    });

    console.log("[generate] generator responded", res.status, "in", Date.now() - started, "ms");

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[generate] generator error", res.status, errText.slice(0, 500));
      return NextResponse.json(
        { error: `Generator returned ${res.status}`, detail: errText.slice(0, 300) },
        { status: 502 }
      );
    }

    // The generator returns a PDF
    const pdfBuffer = await res.arrayBuffer();

    // Store a record in programs table
    const { data: program } = await svc
      .from("programs")
      .insert({
        client_id: assessment.client_id,
        assessment_id: assessment.id,
        trainer_id: user.id,
        name: `${clientProfile?.full_name ?? "Client"} — IMS Plan`,
        weeks: 4,
        status: "published",
        published_at: new Date().toISOString(),
        data: {
          source: "ims_generator",
          generated_at: new Date().toISOString(),
          pdf_mode: body.pdf_mode || "client",
          assessment_summary: {
            goal: goals.primary,
            fra_priorities: fraPriorities,
            constraints,
            concerns,
          },
        },
      })
      .select("id")
      .single();

    // Return the PDF directly for download
    const safeName = (clientProfile?.full_name ?? "client").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}_ims_plan.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("[generate] error after", Date.now() - started, "ms:", err?.name, err?.message);
    return NextResponse.json(
      {
        error: "Generator error",
        detail: err?.name === "TimeoutError"
          ? "The generator took too long. Try again."
          : String(err?.message ?? err).slice(0, 300),
      },
      { status: 502 }
    );
  }
}
