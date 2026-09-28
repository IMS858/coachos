import { type NextRequest, NextResponse } from "next/server";
import {fourWeekStructureIssues} from "@/lib/programs/four-week-integrity";
import {smallJson} from "@/lib/media/request";
import {generationRequestSchema,generationIdentity,sameGenerationIdentity} from "@/lib/coaching/generation-request";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generatorEndpoint } from "@/lib/programs/generator-endpoint";
import { approvedDeviceEvidence } from "@/lib/devices/approved-evidence";
import { generatorCardioProfile, generatorRichRestrictions, includeUnverifiedSurgicalHistory, recommendedTrainingDays } from "@/lib/programs/cardio-assessment";

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

  // Surgical history is represented in constraints_rich with a clearance
  // status, not inferred from a mention of a body part in free text.

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
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid request origin"},{status:403});
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meResult = await supabase.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle();
  if(meResult.error)return NextResponse.json({error:"Staff authorization unavailable"},{status:503});
  const me=meResult.data;
  if(!me||me.deleted_at||!["owner","trainer"].includes(me.role))return NextResponse.json({error:"Active staff only"},{status:403});
  let input:unknown;try{input=await smallJson(request,16384);}catch{return NextResponse.json({error:"Invalid generation request"},{status:400});}
  const parsed=generationRequestSchema.safeParse(input);
  if(!parsed.success)return NextResponse.json({error:"Invalid generation request",detail:parsed.error.issues[0]?.message},{status:400});
  const body=parsed.data,assessmentId=body.assessment_id,pdfMode=body.pdf_mode??"client",workflow=body.response_format==="json",identity=generationIdentity(body);
  // Caller-scoped assessment and assignment checks happen before elevated storage or external processing.
  const assessmentResult=await supabase.from("assessments").select("id,client_id,status,updated_at,data").eq("id",assessmentId).maybeSingle();
  if(assessmentResult.error)return NextResponse.json({error:"Assessment unavailable"},{status:503});
  const assessment=assessmentResult.data;
  if(!assessment||workflow&&assessment.client_id!==body.client_id)return NextResponse.json({error:"Assessment not found"},{status:404});
  const [subject,person]=await Promise.all([
    supabase.from("clients").select("id,primary_trainer_id").eq("id",assessment.client_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name,role,deleted_at").eq("id",assessment.client_id).maybeSingle(),
  ]);
  if(subject.error||person.error)return NextResponse.json({error:"Client authorization unavailable"},{status:503});
  if(!subject.data||!person.data||person.data.deleted_at||person.data.role!=="client"||me.role!=="owner"&&subject.data.primary_trainer_id!==user.id)return NextResponse.json({error:"Assigned coach or owner required"},{status:403});
  const clientProfile=person.data;
  async function existingDraft(){
    if(!workflow)return null;
    const prior=await supabase.from("programs").select("id,client_id,trainer_id,status,data,pdf_client_url,pdf_coach_url").eq("id",body.request_id!).maybeSingle();
    if(prior.error)return NextResponse.json({error:"Generation receipt unavailable. Retry the same request."},{status:503});
    if(!prior.data)return null;
    if(prior.data.status!=="draft")return NextResponse.json({error:"This request already belongs to a non-draft program. Open the saved program instead."},{status:409});
    if(prior.data.client_id!==assessment!.client_id||prior.data.trainer_id!==user!.id||!sameGenerationIdentity(prior.data.data?.generation_request,identity))return NextResponse.json({error:"Request ID belongs to different saved work. Open the existing program; do not reuse this ID."},{status:409});
    return NextResponse.json({request_id:body.request_id,program_id:prior.data.id,client_id:assessment!.client_id,state:(pdfMode==="coach"?prior.data.pdf_coach_url:prior.data.pdf_client_url)?"draft_saved":"needs_pdf_review"},{headers:{"Cache-Control":"private, no-store"}});
  }
  const existing=await existingDraft();if(existing)return existing;
  if(workflow&&(assessment.status!=="complete"||assessment.updated_at!==body.expected_assessment_updated_at))return NextResponse.json({error:"Assessment changed or is incomplete. Refresh and review it before generation."},{status:409});
  const svc=createServiceClient();
  const a = (assessment.data as any) ?? {};
  const { data: privateEvidence, error: privateEvidenceError } = await supabase
    .from("assessment_device_evidence").select("device_measurements,voltra_sessions")
    .eq("assessment_id", assessment.id).maybeSingle();
  if (privateEvidenceError) return NextResponse.json({ error: "Unable to load private objective evidence" }, { status: 503 });
  const deviceEvidence = approvedDeviceEvidence(privateEvidence ?? {});
  const goals = a.goals ?? {};
  const health = a.health ?? {};
  const screen = a.movement_screen ?? {};
  const strength = a.strength_baseline ?? {};
  const lifestyle = a.lifestyle ?? {};
  const bodyComp = a.body_comp ?? {};
  const conditioning = a.conditioning ?? {};
  const summary = a.summary ?? {};
  const client = a.client ?? {};

  const rawFrequency = workflow ? body.sessions_per_week! : Number(summary.recommended_sessions_per_week || goals.target_sessions_per_week || 3);
  const sessionsPerWeek = Number.isInteger(rawFrequency) && rawFrequency >= 1 && rawFrequency <= 5
    ? rawFrequency : 3;
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

  // Normalize sided joint keys. A surgical history without documented clearance
  // remains on hold rather than being silently treated as a safe exercise pool.
  const constraintsRich = includeUnverifiedSurgicalHistory(
    generatorRichRestrictions(a.pain_map ?? {}),
    health.surgeries
  );

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
  if (!workflow && bodyComp.weight_lbs) bc.weight = `${bodyComp.weight_lbs} lbs`;
  if (!workflow && bodyComp.body_fat_pct) bc.body_fat = `${bodyComp.body_fat_pct}%`;
  if (!workflow && bodyComp.lean_mass_lbs) bc.lean_mass = `${bodyComp.lean_mass_lbs} lbs`;

  // Translate to program-generator format
  const generatorPayload = {
    client_name: clientProfile?.full_name ?? "Client",
    age_range: client.age_range || "",
    sex: client.sex || "",
    background: bgParts.join(". ") || "",
    ...recommendedTrainingDays(sessionsPerWeek),
    primary_goal: workflow ? body.goal! : goals.primary || "General strength and movement quality",
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
    coach_notes: [summary.recommendation, summary.focus_areas, summary.red_flags,
      ...deviceEvidence.approved_voltra_notes.map(note => `Approved VOLTRA workout (descriptive only): ${note}`)]
      .filter(Boolean).join(". "),
    ...(deviceEvidence.objective_measures ? { objective_measures: deviceEvidence.objective_measures } : {}),
    pdf_mode: pdfMode,
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
    body_comp_method: workflow ? "" : bodyComp.method || "",
    body_comp_tested_on: workflow ? "" : bodyComp.tested_on || "",
    assessment_date: client.assessment_date || "",
    posture: a.posture ?? {},
    pain_map: a.pain_map ?? {},
    rom_degrees: Object.fromEntries(
      Object.entries(screen).filter(([, v]: any) => v?.rom_degrees).map(([k, v]: any) => [k, v.rom_degrees])
    ),
    red_flags: summary.red_flags || "",
    accessory_categories: a.accessory_categories ?? [],
    // Always send restrictions even without a selected primary machine.
    // An unassessed interval clearance MUST NOT unlock pickups.
    cardio_profile: generatorCardioProfile(ct, conditioning),
    conditioning_level: conditioning.conditioning_level || "",
  };

  const generatorSecret = process.env.PROGRAM_GENERATOR_SECRET;
  const endpoint = generatorEndpoint(process.env.PROGRAM_GENERATOR_URL, "generate", process.env.NODE_ENV === "production");
  if (!generatorSecret || !endpoint) {
    return NextResponse.json({ error: "Secure generator is not configured" }, { status: 503 });
  }
  const started = Date.now();
  try {
    const requestBody = JSON.stringify(generatorPayload);
    if (Buffer.byteLength(requestBody, "utf8") > 262144) {
      return NextResponse.json({ error: "Assessment exceeds generator size limit" }, { status: 413 });
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${generatorSecret}`,
      },
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(55000),
    });

    console.log("[generate] generator responded", res.status, "in", Date.now() - started, "ms");

    if (res.status === 422) {
      const hold = await res.json().catch(() => null);
      if (hold?.error === "coach_review_required") {
        return NextResponse.json({
          error: "coach_review_required",
          detail: "No verified exercise option is available for these restrictions. Review the assessment and approve an appropriate substitution before generating a client plan.",
        }, { status: 422 });
      }
    }
    if (!res.ok) {
      // Upstream errors may contain assessment details; never log or echo them.
      return NextResponse.json(
        { error: `Generator returned ${res.status}`, detail: "The generator could not process this assessment. Review its inputs or retry." },
        { status: 502 }
      );
    }

    // The integrated generator returns the exact generated plan and PDF together.
    // Do not persist or publish a PDF-only response as if it were editable.
    if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return NextResponse.json({ error: "Generator version mismatch: structured response required" }, { status: 502 });
    }
    const result = await res.json().catch(() => null);
    if (!result || !result.program || typeof result.program !== "object" || Array.isArray(result.program)
      || typeof result.pdf_base64 !== "string" || result.pdf_base64.length > 7_000_000) {
      return NextResponse.json({ error: "Generator returned an incomplete or oversized plan" }, { status: 502 });
    }
    if(workflow&&fourWeekStructureIssues(result.program).length)return NextResponse.json({error:"Generator returned an incomplete training structure; no draft was saved."},{status:502});
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.pdf_base64)) {
      return NextResponse.json({ error: "Generator returned an invalid PDF encoding" }, { status: 502 });
    }
    const pdfBuffer = Buffer.from(result.pdf_base64, "base64");
    if (pdfBuffer.byteLength < 5 || pdfBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "Generator returned an invalid PDF" }, { status: 502 });
    }
    const [currentActor,currentSubject,currentPerson,currentAssessment]=await Promise.all([
      supabase.from("profiles").select("role,deleted_at").eq("id",user.id).maybeSingle(),
      supabase.from("clients").select("id,primary_trainer_id").eq("id",assessment.client_id).maybeSingle(),
      supabase.from("profiles").select("role,deleted_at").eq("id",assessment.client_id).maybeSingle(),
      supabase.from("assessments").select("id,client_id,updated_at").eq("id",assessment.id).maybeSingle(),
    ]);
    if(currentActor.error||currentSubject.error||currentPerson.error||currentAssessment.error)return NextResponse.json({error:"Generation authorization could not be rechecked. Retry the same request."},{status:503});
    if(!currentActor.data||currentActor.data.deleted_at||!["owner","trainer"].includes(currentActor.data.role)||!currentSubject.data||!currentPerson.data||currentPerson.data.deleted_at||currentPerson.data.role!=="client"||currentActor.data.role!=="owner"&&currentSubject.data.primary_trainer_id!==user.id)return NextResponse.json({error:"Generation authorization changed; nothing saved."},{status:403});
    if(!currentAssessment.data||currentAssessment.data.client_id!==assessment.client_id||currentAssessment.data.updated_at!==assessment.updated_at)return NextResponse.json({error:"Assessment changed during generation. Refresh before retrying."},{status:409});
    // Store structured plan metadata first. The PDF goes into private storage,
    // never into JSONB where it bloats reads and risks accidental exposure.
    const { data: program, error: saveError } = await svc
      .from("programs")
      .insert({
        ...(workflow?{id:body.request_id}:{}),
        client_id: assessment.client_id,
        assessment_id: assessment.id,
        trainer_id: user.id,
        name: `${clientProfile?.full_name ?? "Client"} — IMS Plan`,
        weeks: 4,
        status: "draft",
        generator_version: result.generator_version,
        contract_version: result.contract_version,
        request_payload: generatorPayload,
        data: {
          source: "ims_generator",
          ...(workflow?{generation_request:identity}:{}),
          structured_program: result.program,
          generator_version: result.generator_version,
          contract_version: result.contract_version,
          generated_at: new Date().toISOString(),
          pdf_mode: pdfMode,
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
    if (saveError || !program) {
      if(workflow&&saveError?.code==="23505"){const raced=await existingDraft();if(raced)return raced;}
      console.error("[generate] could not save draft", saveError?.code);
      return NextResponse.json({ error: "PDF generated but could not save the program draft. Please retry." }, { status: 500 });
    }

    const pdfPath = `${assessment.client_id}/${program.id}/initial-${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await svc.storage.from("ims-program-pdfs")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      // Preserve the request identity and structured draft for explicit PDF recovery.
      if(workflow)return NextResponse.json({request_id:body.request_id,program_id:program.id,client_id:assessment.client_id,state:"needs_pdf_review"},{headers:{"Cache-Control":"private, no-store"}});
      await svc.from("programs").delete().eq("id", program.id);
      console.error("[generate] private PDF upload failed", uploadError.name);
      return NextResponse.json({ error: "Could not securely store the generated PDF. Retry generation." }, { status: 502 });
    }
    const { error: linkError } = await svc.from("programs")
      .update({ pdf_client_url: pdfMode === "client" ? pdfPath : null,
        pdf_coach_url: pdfMode === "coach" ? pdfPath : null })
      .eq("id", program.id);
    if (linkError) {
      if(workflow)return NextResponse.json({request_id:body.request_id,program_id:program.id,client_id:assessment.client_id,state:"needs_pdf_review"},{headers:{"Cache-Control":"private, no-store"}});
      await svc.storage.from("ims-program-pdfs").remove([pdfPath]);
      await svc.from("programs").delete().eq("id", program.id);
      return NextResponse.json({ error: "Could not link the private PDF. Retry generation." }, { status: 502 });
    }
    if(workflow)return NextResponse.json({request_id:body.request_id,program_id:program.id,client_id:assessment.client_id,state:"draft_saved"},{headers:{"Cache-Control":"private, no-store"}});
    // Return the PDF directly for download
    const safeName = (clientProfile?.full_name ?? "client").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "X-IMS-Program-ID": program.id,
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeName}_ims_plan.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("[generate] error after", Date.now() - started, "ms:", err?.name);
    return NextResponse.json(
      {
        error: "Generator error",
        detail: err?.name === "TimeoutError"
          ? "The generator took too long. Try again."
          : "Unable to generate the plan right now.",
      },
      { status: 502 }
    );
  }
}
