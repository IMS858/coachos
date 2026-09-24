import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_MEASUREMENTS = 100;
type Measurement = { device: "activforce_2"; kind: "rom" | "force"; joint: string;
  motion: string; side: "left" | "right" | "bilateral"; value: number;
  unit: "degrees" | "lb" | "N"; test_date: string; position: string; notes: string;
  protocol: "peak_isometric" | "unspecified" | "rom_unspecified";
  rom_mode?: "active" | "passive" | "unspecified" };
function valid(m: unknown): m is Measurement {
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  const x = m as Record<string, unknown>;
  const short = (v: unknown, n: number) => typeof v === "string" && v.trim().length > 0 && v.length <= n;
  const date = typeof x.test_date === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(x.test_date)
    && !Number.isNaN(Date.parse(x.test_date));
  return x.device === "activforce_2" && ["rom", "force"].includes(String(x.kind))
    && short(x.joint, 100) && short(x.motion, 100) && short(x.position, 150)
    && ["left", "right", "bilateral"].includes(String(x.side))
    && typeof x.value === "number" && Number.isFinite(x.value) && x.value >= 0
    && (x.kind === "rom" ? x.unit === "degrees" && x.value <= 360
      : ["lb", "N"].includes(String(x.unit)) && x.value <= 10000)
    && (x.kind === "force" ? ["peak_isometric", "unspecified"].includes(String(x.protocol))
      : x.protocol === "rom_unspecified" && ["active", "passive", "unspecified"].includes(String(x.rom_mode ?? "unspecified")))
    && date && typeof x.notes === "string" && x.notes.length <= 500;
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || profile.role === "client") return NextResponse.json({ error: "Staff only" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !valid(body.measurement)) return NextResponse.json({ error: "Invalid measurement" }, { status: 400 });
  const { data: assessment, error: readError } = await supabase.from("assessments")
    .select("id").eq("id", id).maybeSingle();
  if (readError || !assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const { data: evidence, error: evidenceError } = await supabase.from("assessment_device_evidence")
    .select("device_measurements,updated_at").eq("assessment_id",id).maybeSingle();
  if (evidenceError) return NextResponse.json({ error: "Could not load private measurements" }, { status: 500 });
  const existing = Array.isArray(evidence?.device_measurements) ? evidence.device_measurements : [];
  if (existing.length >= MAX_MEASUREMENTS) return NextResponse.json({ error: "Measurement limit reached" }, { status: 400 });
  const next = [...existing, { ...body.measurement, recorded_by: user.id,
    recorded_at: new Date().toISOString(), review_status: "requires_coach_review" }];
  const now = new Date().toISOString();
  const query = evidence ? supabase.from("assessment_device_evidence")
    .update({ device_measurements: next, updated_at: now })
    .eq("assessment_id",id).eq("updated_at",evidence.updated_at)
    : supabase.from("assessment_device_evidence").insert({ assessment_id:id, device_measurements:next });
  const { data: saved, error } = await query.select("assessment_id").maybeSingle();
  if (error || !saved) return NextResponse.json({ error: error ? "Could not save measurement" : "Measurements changed; reload and retry" }, { status: error ? 500 : 409 });
  return NextResponse.json({ saved: true, measurement_count: existing.length + 1 });
}
