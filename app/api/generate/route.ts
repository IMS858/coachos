import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Vercel: allow up to 60s (Hobby cap) — Claude generation takes 15-40s.
// Without this the function dies at the 10s default and the request times out.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/generate  { assessment_id }
 *
 * Generates an IMS training program from an assessment using Claude directly
 * (no external Python service). The program is built around IMS methodology:
 * CARs joint prep first, then phased strength, conditioning, and recovery.
 *
 * The result is stored in programs.data as structured JSON and rendered by the
 * program detail page.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !["owner", "trainer"].includes(me.role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { assessment_id } = await request.json();
  if (!assessment_id) {
    return NextResponse.json({ error: "assessment_id required" }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, client_id, data")
    .eq("id", assessment_id)
    .maybeSingle();
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || !apiKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      {
        error: "Generator not configured",
        detail: !apiKey
          ? "ANTHROPIC_API_KEY is missing in Vercel. Add it and redeploy."
          : "ANTHROPIC_API_KEY looks invalid — it must start with sk-ant-. Re-paste the key in Vercel and redeploy.",
      },
      { status: 503 }
    );
  }

  const a = (assessment.data as any) ?? {};
  const goals = a.goals ?? {};
  const health = a.health ?? {};
  const screen = a.movement_screen ?? {};
  const strength = a.strength_baseline ?? {};
  const summary = a.summary ?? {};
  const painMap = a.pain_map ?? {};
  const lifestyle = a.lifestyle ?? {};
  const posture = a.posture ?? {};
  const conditioning = a.conditioning ?? {};
  const bodyComp = a.body_comp ?? {};

  const sessionsPerWeek =
    summary.recommended_sessions_per_week || goals.target_sessions_per_week || 3;

  // Build pain summary from pain map (only non-empty areas)
  const painEntries = Object.entries(painMap)
    .filter(([, v]: any) => v?.severity && v.severity !== "0")
    .map(([k, v]: any) => `  ${k.replace(/_/g, " ")}: ${v.severity}/10${v.description ? ` — ${v.description}` : ""}`)
    .join("\n");

  // Build posture findings (only non-empty)
  const postureEntries = Object.entries(posture)
    .filter(([k, v]) => v && k !== "notes")
    .map(([k, v]) => `  ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  const prompt = `You are Jason Patterson's AI programming assistant at IMS (Innovative Movement Solutions), a premium FRC-certified movement coaching studio in Scripps Ranch, San Diego. You hold the same certifications Jason does: FRC, FRA, Kinstretch, FRC-ISM. You think in terms of joint health, usable range of motion, and progressive loading — never generic fitness.

Your job: build a COMPLETE, individualized 4-week training program from this client's comprehensive assessment. This document will be handed to the client and followed session by session. It must be specific enough that any qualified coach could run the session exactly as written.

═══ IMS METHOD v2 — SESSION ARCHITECTURE (non-negotiable) ═══

Every strength session follows this exact block sequence:

BLOCK 1 · CARs SEQUENCE
Controlled Articular Rotations for THIS client's priority joints. Three intensity levels:
  L1 (Movement Focus) — teach the pattern, low irradiation, map the joint
  L2 (Capsular Focus) — actively explore end ranges, moderate irradiation, deliberate slowdown at restricted points
  L3 (Irradiation Focus) — maximum systemic tension, slowest pace, drives real articular adaptation
Name exercises as "[Joint] CAR - [Level] Focus" (e.g. "Hip CAR - Capsular Focus").
New/deconditioned clients: L1 only. Intermediate: L1-L2. Advanced: L2-L3.
Dose: 2-3 reps per direction per joint.

BLOCK 2 · DYNAMIC WARMUP
Movement preparation targeting the session's primary patterns. Bodyweight or light load.

BLOCK 3 · JOINT CARE (if needed)
Only if client has flagged joint concerns. Iso holds, PAILs/RAILs progressions, or corrective drills for specific restrictions.

BLOCK 4 · MOBILITY PREP
RAILs-based: Lift-Offs, Hovers, End-Range Rotations at priority joints. NOT passive stretching — active, loaded end-range work.

BLOCK 5 · STRENGTH A (compound)
2 primary compound lifts for the day's focus (lower or upper body). Progressive overload across the 4-week block.
SPINE-SENSITIVE RULE: If client has SI joint sensitivity or no-axial-loading constraint, substitute split squats for back squats, single-leg RDLs for conventional deadlifts. Never load the spine axially without clearance.

BLOCK 6 · STRENGTH B (accessory + corrective)
2-3 exercises. One corrective tied to their FRA priority, one-two accessories that support Strength A patterns.

BLOCK 7 · STRENGTH C (accessory volume, optional)
1-2 isolation or machine exercises for weak links identified in the assessment. Only if time/recovery allows.

BLOCK 8 · CONDITIONING FINISHER
Energy system work that complements (not competes with) the strength work. Appropriate for their conditioning level and limitations.

BLOCK 9 · DECOMPRESSION COOL DOWN
Breathing, gentle mobility, decompress the spine. 3-5 minutes.

BLOCK 10 · CAPSULE WORK (PAIL/RAIL)
End-of-session capsular loading. PAILs (Progressive Angular Isometric Loading) and RAILs (Regressive Angular Isometric Loading) at the session's priority joints. This is where real tissue adaptation happens.
Name exercises as "[Joint] [Position] PAIL/RAIL" (e.g. "Hip 90/90 Anterior PAIL/RAIL").

═══ 4-WEEK BLOCK PROGRESSION (from IMS generator) ═══
Week 1 · BASE VOLUME: 3×12, RPE 7. Groove the pattern, build tolerance. Stop with 2-3 reps in reserve. If form breaks before rep 12, drop weight.
Week 2 · TEMPO CONTROL: 3×10 with 3-second eccentrics, RPE 7-8. Same load as Week 1, slow the descent. Feel the muscle work.
Week 3 · STRENGTH BUILD: 4×8, RPE 8. Standard tempo returns. First real strength push. Last rep should feel hard.
Week 4 · PERFORMANCE: 4×6, RPE 8-9. Top-end load. OR retest 10RM if coach approves — compare directly to baseline.

═══ FRA PRIORITY ROTATION ═══
For multi-session weeks, rotate FRA priorities across days:
- Lower body priorities land on lower body days
- Upper body priorities land on upper body days
- Cardio/integration days get no FRA focus

═══ THIS CLIENT'S FULL ASSESSMENT ═══

GOALS & HISTORY:
Primary goal: ${goals.primary || "general strength & movement quality"}
Secondary goals: ${goals.secondary || "—"}
Training history: ${goals.training_history || "no recent consistent training"}
Current frequency: ${goals.training_frequency_current || "—"}
Current training type: ${goals.training_type_current || "—"}
What's worked before: ${goals.what_worked || "—"}
What hasn't worked: ${goals.what_didnt || "—"}
Target sessions/week: ${sessionsPerWeek}

HEALTH:
Current injuries: ${health.injuries_current || "none reported"}
Past injuries: ${health.injuries_past || "none reported"}
Surgeries: ${health.surgeries || "none reported"}
Conditions: ${health.conditions || "none reported"}
Medications: ${health.medications || "none"}
Coach health notes: ${health.notes || "—"}

${painEntries ? `PAIN MAP (severity 0-10):\n${painEntries}` : "PAIN MAP: No significant pain reported."}

LIFESTYLE & RECOVERY CAPACITY:
Occupation: ${lifestyle.occupation || "—"}
Desk hours/day: ${lifestyle.desk_hours || "—"}
Sleep: ${lifestyle.sleep_hours || "—"} hours, quality: ${lifestyle.sleep_quality || "—"}
Stress level: ${lifestyle.stress_level || "—"}
Activity outside training: ${lifestyle.activity_outside_training || "—"}
Nutrition: ${lifestyle.nutrition_notes || "—"}

${postureEntries ? `POSTURE ANALYSIS:\n${postureEntries}${posture.notes ? `\n  Coach notes: ${posture.notes}` : ""}` : "POSTURE: Not assessed."}

MOVEMENT SCREEN (CARs-based, joint-by-joint):
${Object.entries(screen).map(([k, v]: any) => `  ${k}: ${v?.rating || "not tested"}${v?.rom_degrees ? ` (ROM: ${v.rom_degrees})` : ""}${v?.note ? ` — ${v.note}` : ""}`).join("\n")}

STRENGTH BASELINE (pattern-by-pattern):
${Object.entries(strength).map(([k, v]: any) => `  ${k}: ${v?.level || "not tested"}${v?.load ? ` @ ${v.load}` : ""}${v?.note ? ` — ${v.note}` : ""}`).join("\n")}

CONDITIONING:
Resting HR: ${conditioning.resting_hr || "—"}
Level: ${conditioning.conditioning_level || "—"}
Preferred modality: ${conditioning.preferred_modality || "—"}
Limitations: ${conditioning.limitations || "—"}

BODY COMPOSITION:
Weight: ${bodyComp.weight_lbs ? `${bodyComp.weight_lbs} lbs` : "—"}
Body fat: ${bodyComp.body_fat_pct ? `${bodyComp.body_fat_pct}%` : "—"}
Lean mass: ${bodyComp.lean_mass_lbs ? `${bodyComp.lean_mass_lbs} lbs` : "—"}

COACH SUMMARY:
Focus areas: ${summary.focus_areas || "—"}
Primary limitations: ${summary.primary_limitations || "—"}
Red flags: ${summary.red_flags || "—"}
Overall recommendation: ${summary.recommendation || "—"}

═══ WHAT MAKES THIS PROGRAM PREMIUM ═══
- Every exercise must be CONNECTED to the assessment. In the coaching note, briefly explain WHY this exercise was chosen for this client (e.g. "builds hip end-range control — their hips tested limited").
- For limited joints: include specific CARs + PAILs/RAILs or Kinstretch-style progressive angular isometric loading.
- For painful patterns: provide a REGRESSION option (e.g. "if hinge is painful, substitute: ... ").
- Exercise detail: sets, reps (or time), tempo (e.g. "3-1-2-0"), rest period, and intensity (RPE 1-10).
- The program should read like a $150/session FRC-certified coach wrote it — precise language, real exercises, specific cues.

═══ 4-WEEK PROGRESSION (not generic) ═══
Week 1: Movement quality + motor control. Lower loads, higher attention to form. Groove the patterns.
Week 2: Begin progressive loading. Add sets or reps, introduce tempo challenges.
Week 3: Peak training volume. Intensity climbs. Challenge end-range positions.
Week 4: Strategic deload. Reduce volume 40-50%, maintain intensity, retest key positions. Prepare for next cycle.
Specify concrete set/rep/load changes per week in the progression notes.

═══ RESPOND WITH ONLY VALID JSON ═══
No markdown. No preamble. No explanation outside the JSON. Use this exact structure:
{
  "name": "program name specific to this client's needs",
  "summary": "3-4 sentences: what this program prioritizes and WHY, based on their assessment findings",
  "weeks": 4,
  "sessions_per_week": ${sessionsPerWeek},
  "focus": "the primary physical development goal",
  "weekly_progression": [
    { "week": 1, "theme": "...", "intensity": "RPE 5-6", "volume_note": "..." },
    { "week": 2, "theme": "...", "intensity": "RPE 6-7", "volume_note": "..." },
    { "week": 3, "theme": "...", "intensity": "RPE 7-8", "volume_note": "..." },
    { "week": 4, "theme": "deload & retest", "intensity": "RPE 5", "volume_note": "..." }
  ],
  "weekly_structure": [
    {
      "day_label": "Day 1 — Lower Body + Hip Mobility Focus",
      "day_type": "strength_lb or strength_ub or integration or cardio",
      "focus": "what this session develops and why it's placed here in the week",
      "blocks": [
        { "block": "CARs Sequence", "exercises": [{ "name": "Hip CAR - Capsular Focus", "sets": "2", "reps": "3 each direction", "tempo": "slow", "rest": "—", "intensity": "L2", "notes": "WHY this joint + specific cue" }] },
        { "block": "Dynamic Warmup", "exercises": [{ "...": "full detail" }] },
        { "block": "Mobility Prep", "exercises": [{ "...": "RAILs-based drills, lift-offs, hovers" }] },
        { "block": "Strength A", "exercises": [{ "...": "2 compound lifts, full detail" }] },
        { "block": "Strength B", "exercises": [{ "...": "2-3 accessory + corrective, full detail" }] },
        { "block": "Conditioning", "exercises": [{ "...": "appropriate for their level" }] },
        { "block": "Cool Down + Capsule Work", "exercises": [{ "...": "decompression + PAIL/RAIL at priority joints" }] }
      ]
    }
  ],
  "progression_notes": "detailed week-by-week guidance: what changes in weeks 2/3/4 for each block. Specific set/rep/load progressions.",
  "coach_cautions": "specific red flags to watch for given their injuries/pain patterns. Include regressions: 'if X hurts during Y, substitute Z.'",
  "home_work": "2-3 things the client should do between sessions (daily CARs for specific joints, breathing drills, etc.)"
}

Generate exactly ${sessionsPerWeek} days in weekly_structure. Each strength day should have 7 blocks (CARs, Warmup, Mobility Prep, Strength A, Strength B, Conditioning, Cool Down + Capsule Work). Each block needs 2-4 real, coachable exercises with full detail. Use the exact CARs naming convention ("[Joint] CAR - [Level] Focus"). Use real PAIL/RAIL exercise names for capsule work. Reference their specific limited/painful joints by name throughout.

CRITICAL: Keep your JSON valid. Do not leave any strings unterminated. Close all brackets. Complete the full structure before stopping.`;

  let programData: any;
  const started = Date.now();
  try {
    console.log("[generate] calling Anthropic, key present:", !!apiKey, "len:", apiKey?.length);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 12000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    console.log("[generate] Anthropic responded", res.status, "in", Date.now() - started, "ms");

    if (!res.ok) {
      const detail = await res.text();
      console.error("[generate] Anthropic error", res.status, detail.slice(0, 500));
      const friendly =
        res.status === 401
          ? "The Anthropic API key in Vercel is invalid. Create a fresh key at console.anthropic.com and update ANTHROPIC_API_KEY in Vercel, then redeploy."
          : res.status === 400 && detail.includes("credit")
          ? "The Anthropic account is out of credit. Add billing at console.anthropic.com."
          : `Anthropic returned ${res.status}.`;
      return NextResponse.json(
        { error: `Anthropic ${res.status}`, detail: friendly },
        { status: 502 }
      );
    }

    const json = await res.json();
    const text = (json.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    try {
      programData = JSON.parse(clean);
    } catch {
      // Response may have been truncated at the token limit — try to repair
      // by closing unterminated strings/brackets, then re-parse.
      programData = tryRepairJson(clean);
      if (!programData) {
        console.error("[generate] JSON parse failed, length:", clean.length);
        return NextResponse.json(
          {
            error: "Generation incomplete",
            detail:
              "The program was too long and got cut off. Try again — it usually completes on a second run.",
          },
          { status: 502 }
        );
      }
    }
  } catch (err: any) {
    console.error("[generate] caught error after", Date.now() - started, "ms:", err?.name, err?.message);
    const msg =
      err?.name === "TimeoutError" || err?.name === "AbortError"
        ? "The AI request timed out. Check that ANTHROPIC_API_KEY is valid and has billing credit."
        : String(err?.message ?? err).slice(0, 300);
    return NextResponse.json({ error: "Generator error", detail: msg }, { status: 502 });
  }

  const { data: program, error: progErr } = await supabase
    .from("programs")
    .insert({
      client_id: assessment.client_id,
      assessment_id: assessment.id,
      trainer_id: user.id,
      name: programData.name || `Program — ${new Date().toLocaleDateString("en-US")}`,
      weeks: programData.weeks || 4,
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

/**
 * Best-effort repair of truncated JSON from a cut-off LLM response.
 * Closes any unterminated string, then balances open brackets/braces.
 * Returns parsed object or null.
 */
function tryRepairJson(s: string): any {
  // Trim to the last plausible structural char if it ends mid-token
  let str = s;
  // If we're inside an unterminated string (odd number of unescaped quotes), close it
  const quoteCount = (str.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) str += '"';

  // Balance brackets and braces by counting and appending closers
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"' && str[i - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  // Remove a dangling trailing comma before closing
  str = str.replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    str += open === "{" ? "}" : "]";
  }

  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
