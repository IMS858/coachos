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
  // Map Coach OS joint keys → generator FRA priority descriptions
  // Format must match parse_fra_priority() expectations: "Joint Direction Side"
  const jointMap: Record<string, string[]> = {
    hips: ["Hip IR L+R", "Hip ER L+R"],
    shoulders: ["Shoulder ER L+R", "Shoulder Flexion L+R"],
    t_spine: ["Thoracic Extension", "Thoracic Rotation L+R"],
    ankles: ["Ankle Dorsiflexion L+R"],
    neck: ["Cervical Rotation L+R"],
    wrists: ["Wrist Extension L+R"],
    knees: ["Knee Flexion L+R"],
  };

  // Painful joints get highest priority, then limited
  const painful: string[] = [];
  const limited: string[] = [];
  for (const [joint, val] of Object.entries(screen ?? {}) as [string, any][]) {
    const mapped = jointMap[joint];
    if (!mapped) continue;
    if (val?.rating === "painful") painful.push(mapped[0]);
    else if (val?.rating === "limited") limited.push(mapped[0]);
  }
  priorities.push(...painful, ...limited);
  return priorities.slice(0, 5);
}

/** Map Coach OS movement screen → mobility_map for the generator. */
function mapMobilityMap(screen: any): any[] {
  const ratings: any[] = [];
  // Generator expects: joint (lowercase singular), direction, side (L/R/bilateral), rating (green/yellow/red)
  const jointDirections: Record<string, { joint: string; dirs: string[] }> = {
    hips:      { joint: "hip",      dirs: ["IR", "ER", "flexion", "extension"] },
    shoulders: { joint: "shoulder", dirs: ["flexion", "ER", "IR"] },
    t_spine:   { joint: "thoracic", dirs: ["rotation", "extension"] },
    ankles:    { joint: "ankle",    dirs: ["dorsiflexion"] },
    neck:      { joint: "cervical", dirs: ["rotation", "flexion"] },
    knees:     { joint: "knee",     dirs: ["flexion"] },
    wrists:    { joint: "wrist",    dirs: ["extension", "flexion"] },
  };

  const ratingMap: Record<string, string> = {
    good: "green", limited: "yellow", painful: "red",
  };

  for (const [key, val] of Object.entries(screen ?? {}) as [string, any][]) {
    const mapping = jointDirections[key];
    if (!mapping) continue;
    const color = ratingMap[val?.rating] ?? "not_tested";
    for (const dir of mapping.dirs) {
      ratings.push({
        joint: mapping.joint,
        direction: dir,
        side: "bilateral",
        rating: color,
      });
    }
  }
  return ratings;
}

/** Map Coach OS strength baseline → strength_marker_results + marker IDs. */
function mapStrength(baseline: any, constraints: string[]): { markers: string[]; results: Record<string, string> } {
  const markers: string[] = [];
  const results: Record<string, string> = {};
  const hasSpineConstraint = constraints.some(c => c.includes("SI") || c.includes("axial") || c.includes("spine"));

  // Map Coach OS patterns → generator marker IDs (spine-aware)
  const patternToMarker: Record<string, { id: string; spineAlt?: string }> = {
    squat:             { id: "back_squat", spineAlt: "goblet_squat" },
    hinge:             { id: "conventional_deadlift", spineAlt: "sl_rdl" },
    push_horizontal:   { id: "incline_pushups" },
    push_vertical:     { id: "landmine_sa_press" },
    pull_horizontal:   { id: "inverted_rows" },
    pull_vertical:     { id: "lat_pulldown" },
    carry:             { id: "farmer_carry" },
    core_anti_lateral: { id: "side_plank_hold" },
    core_anti_extension: { id: "side_plank_hold" },  // closest available
  };

  for (const [pattern, val] of Object.entries(baseline ?? {}) as [string, any][]) {
    const mapping = patternToMarker[pattern];
    if (!mapping) continue;
    const markerId = (hasSpineConstraint && mapping.spineAlt) ? mapping.spineAlt : mapping.id;
    markers.push(markerId);
    if (val?.load) {
      results[markerId] = val.load;
    }
  }
  return { markers: [...new Set(markers)], results };
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
  const client = a.client ?? {};

  const sessionsPerWeek = summary.recommended_sessions_per_week || goals.target_sessions_per_week || 3;
  const { constraints, concerns, concernNotes } = mapConstraints(a);

  // FRA priorities: use coach-ranked if available, otherwise auto-derive from screen
  const fraPriorities = (a.fra_priorities ?? []).filter((p: string) => p?.trim())
    .length > 0
    ? (a.fra_priorities as string[]).filter((p: string) => p?.trim())
    : mapFRAPriorities(screen);

  const mobilityMap = mapMobilityMap(screen);
  const { markers: autoMarkers, results: autoResults } = mapStrength(strength, constraints);

  // Strength markers: use coach-entered test results if available, otherwise auto-map
  const coachMarkers = a.strength_markers ?? {};
  const hasCoachMarkers = Object.values(coachMarkers).some((v: any) => v?.trim());
  const strengthMarkers = hasCoachMarkers
    ? Object.keys(coachMarkers).filter((k: string) => (coachMarkers as any)[k]?.trim())
    : autoMarkers;
  const strengthResults = hasCoachMarkers
    ? Object.fromEntries(
        Object.entries(coachMarkers as Record<string, string>).filter(([, v]) => v?.trim())
      )
    : autoResults;

  // Cardio tolerance
  const ct = a.cardio_tolerance ?? {};

  // Constraint status enrichment
  const constraintsRich = Object.entries(a.pain_map ?? {})
    .filter(([, v]: any) => v?.status && v.status !== "")
    .map(([key, v]: any) => ({
      key: key.replace(/_/g, " "),
      display_name: key.replace(/_/g, " "),
      status: v.status,
      pain_level: v.severity ? Number(v.severity) : null,
      avoid_notes: v.description || null,
    }));

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
    age_range: client.age_range || "",
    sex: client.sex || "",
    background: bgParts.join(". ") || "",
    strength_days: Math.min(sessionsPerWeek, 4),
    cardio_days: sessionsPerWeek > 3 ? 1 : 0,
    training_frequency: sessionsPerWeek,
    primary_goal: goals.primary || "General strength and movement quality",
    fra_priorities: fraPriorities,
    mobility_map: mobilityMap,
    strength_markers: strengthMarkers,
    strength_marker_results: strengthResults,
    constraints,
    concerns,
    concern_notes: concernNotes,
    constraints_rich: constraintsRich,
    body_comp: Object.keys(bc).length > 0 ? bc : {},
    activity_factor: 1.45,
    // The coach picks this explicitly now; the keyword guess is only a fallback
    // for assessments taken before that field existed.
    nutrition_strategy:
      bodyComp.nutrition_strategy ||
      (goals.primary?.toLowerCase().includes("lose") ||
      goals.primary?.toLowerCase().includes("fat")
        ? "fat_loss"
        : "maintenance"),
    coach_notes: [summary.recommendation, summary.focus_areas, summary.red_flags].filter(Boolean).join(". "),
    pdf_mode: body.pdf_mode || "client",
    // ── Coach OS integration fields ──
    sleep_quality: lifestyle.sleep_quality || "",
    sleep_hours: lifestyle.sleep_hours || "",
    stress_level: lifestyle.stress_level || "",
    desk_hours: lifestyle.desk_hours || "",
    resting_hr: conditioning.resting_hr || "",
    hrr_end_hr: conditioning.hrr_end_hr || "",
    hrr_one_min_hr: conditioning.hrr_one_min_hr || "",
    hrr_drop:
      Number.isFinite(parseInt(conditioning.hrr_end_hr, 10)) &&
      Number.isFinite(parseInt(conditioning.hrr_one_min_hr, 10))
        ? parseInt(conditioning.hrr_end_hr, 10) - parseInt(conditioning.hrr_one_min_hr, 10)
        : null,
    body_comp_method: bodyComp.method || "",
    body_comp_tested_on: bodyComp.tested_on || "",
    assessment_date: client.assessment_date || "",
    posture: a.posture ?? {},
    pain_map: a.pain_map ?? {},
    rom_degrees: Object.fromEntries(
      Object.entries(screen).filter(([, v]: any) => v?.rom_degrees).map(([k, v]: any) => [k, v.rom_degrees])
    ),
    red_flags: summary.red_flags || "",
    accessory_categories: a.accessory_categories ?? [],
    // Cardio profile
    ...(ct.primary_machine ? {
      cardio_profile: {
        primary_modality: ct.primary_machine,
        secondary_modalities: ct.tolerated_machines ?? [],
        avoid_modalities: ct.avoid_machines ?? [],
        interval_clearance: ct.interval_clearance || "not_assessed",
      },
    } : {}),
  };

  const started = Date.now();
  try {
    console.log("[generate] payload:", JSON.stringify({
      fra_priorities: generatorPayload.fra_priorities,
      mobility_map_count: generatorPayload.mobility_map.length,
      strength_markers: generatorPayload.strength_markers,
      constraints: generatorPayload.constraints,
      concerns: generatorPayload.concerns,
      strength_days: generatorPayload.strength_days,
      cardio_days: generatorPayload.cardio_days,
    }));
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
