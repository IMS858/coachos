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

  const sessionsPerWeek =
    summary.recommended_sessions_per_week || goals.target_sessions_per_week || 3;

  const prompt = `You are the head programming coach at IMS (Innovative Movement Solutions), a premium movement-coaching studio for adults 35-65. Build a 4-week training program from this assessment.

IMS METHODOLOGY (must follow):
- Every session STARTS with joint preparation: Controlled Articular Rotations (CARs) and targeted mobility for the client's limited/painful joints, before any load.
- Then progressive strength built on safe, coached movement patterns — never grind through pain.
- Conditioning that complements strength, not competes with it.
- Recovery is part of the plan.
- Programming is individualized to THIS person — not a template.

ASSESSMENT:
Primary goal: ${goals.primary || "general strength & movement"}
Secondary goals: ${goals.secondary || "—"}
Training history: ${goals.training_history || "—"}
Target sessions/week: ${sessionsPerWeek}
Current injuries: ${health.injuries_current || "none noted"}
Past injuries: ${health.injuries_past || "none noted"}
Conditions: ${health.conditions || "none noted"}
Pain areas: ${health.pain_areas || "none noted"}
Movement screen (joint: rating): ${Object.entries(screen).map(([k, v]: any) => `${k}: ${v?.rating || "n/a"}`).join(", ")}
Strength baseline (pattern: level): ${Object.entries(strength).map(([k, v]: any) => `${k}: ${v?.level || "n/a"}`).join(", ")}
Coach focus areas: ${summary.focus_areas || "—"}

Respond with ONLY valid JSON (no markdown, no preamble) in this exact shape:
{
  "name": "short program name",
  "summary": "2-3 sentence overview of the strategy for this client",
  "weeks": 4,
  "sessions_per_week": ${sessionsPerWeek},
  "focus": "the main physical priority",
  "weekly_structure": [
    {
      "day_label": "Day 1 — e.g. Lower Body + Hip Mobility",
      "blocks": [
        {
          "block": "Joint Prep",
          "exercises": [
            { "name": "exercise", "sets": "2", "reps": "5/side", "notes": "coaching cue" }
          ]
        },
        { "block": "Strength", "exercises": [ ... ] },
        { "block": "Conditioning", "exercises": [ ... ] },
        { "block": "Recovery", "exercises": [ ... ] }
      ]
    }
  ],
  "progression_notes": "how to progress weeks 1-4",
  "coach_cautions": "what to watch given their injuries/pain"
}

Make it ${sessionsPerWeek} days. Address their specific limited/painful joints in the Joint Prep block. Keep exercise names real and coachable.`;

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    console.log("[generate] Anthropic responded", res.status, "in", Date.now() - started, "ms");

    if (!res.ok) {
      const detail = await res.text();
      console.error("[generate] Anthropic error", res.status, detail.slice(0, 500));
      return NextResponse.json(
        { error: `Anthropic ${res.status}`, detail: detail.slice(0, 300) },
        { status: 502 }
      );
    }

    const json = await res.json();
    const text = (json.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
    const clean = text.replace(/```json|```/g, "").trim();
    programData = JSON.parse(clean);
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
