import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureInput } from "./capture";

export class CaptureError extends Error {
  constructor(message: string, public status: number, public exerciseSaved = false) { super(message); }
}
const columns = "id,name,slug,status,client_visible,created_by,setup_notes";
/** Two replay-safe steps. A failed client-draft save never claims the whole action succeeded. */
export async function saveCapture(db: Pick<SupabaseClient, "from">, actor: string, input: CaptureInput) {
  if (input.client_context_id) {
    const [profile, client] = await Promise.all([
      db.from("profiles").select("id").eq("id", input.client_context_id).eq("role", "client").is("deleted_at", null).maybeSingle(),
      db.from("clients").select("id").eq("id", input.client_context_id).maybeSingle(),
    ]);
    if (profile.error || client.error) throw new CaptureError("Client lookup unavailable. Nothing was saved.", 503);
    if (!profile.data || !client.data) throw new CaptureError("Client not found or not accessible.", 404);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ actor, input })).digest("hex");
  const meta = JSON.stringify({ kind: "ims_capture_v1", request_fingerprint: fingerprint, default_load: input.default_prescription.load });
  const same = (row: { created_by?: string | null; setup_notes?: string | null; status?: string } | null) => !!row && row.created_by === actor && row.setup_notes === meta && row.status === "draft";
  let found = await db.from("exercises").select(columns).eq("id", input.request_id).maybeSingle();
  if (found.error) throw new CaptureError("Could not check the prior save. Retry the same action.", 503);
  if (found.data && !same(found.data)) throw new CaptureError("This save was already used or the exercise changed. Reopen the saved draft.", 409);
  const deduped = !!found.data;
  if (!found.data) {
    const slug = (input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "exercise") + "-" + input.request_id;
    const p = input.default_prescription;
    const saved = await db.from("exercises").insert({
      id: input.request_id, name: input.name, ims_label: input.name, slug,
      category: input.category, movement_pattern: input.category === "mobility" ? "mobility_drill" : "other", level: "foundational",
      short_description: input.description || null, coaching_cues: input.coaching_cues, primary_joints: input.primary_joints,
      default_sets: p.sets, default_reps: p.reps || null, default_rest_seconds: p.rest_seconds, default_tempo: p.tempo || null,
      setup_notes: meta, video_guid: input.video_storage_path ? `supabase:${input.video_storage_path}` : null,
      tags: ["ims_custom"], status: "draft", client_visible: false, created_by: actor,
    }).select(columns).single();
    if (saved.error?.code === "23505") found = await db.from("exercises").select(columns).eq("id", input.request_id).maybeSingle();
    else found = saved;
    if (found.error || !same(found.data)) throw new CaptureError("Exercise save was not confirmed. Retry the same save; do not upload again.", 503);
  }
  const exercise = found.data!;
  if (input.client_context_id && input.client_program_id) {
    const query = () => db.from("programs").select("id,client_id,trainer_id,data").eq("id", input.client_program_id!).maybeSingle();
    const matches = (p: { client_id?: string; trainer_id?: string; data?: Record<string, unknown> } | null) => !!p && p.client_id === input.client_context_id && p.trainer_id === actor && p.data?.capture_fingerprint === fingerprint;
    let prior = await query();
    if (prior.error) throw new CaptureError("Exercise saved; client draft lookup failed. Retry to finish without duplicating the exercise.", 503, true);
    if (prior.data && !matches(prior.data)) throw new CaptureError("Exercise saved; the client draft reference conflicts with another record.", 409, true);
    if (!prior.data) {
      const p = input.default_prescription;
      const saved = await db.from("programs").insert({ id: input.client_program_id, client_id: input.client_context_id, trainer_id: actor,
        name: `${input.name} — quick draft`.slice(0,160), status: "draft", weeks: 4, coach_edits: {},
        data: { source: "ims_library_program", visibility: "coach_only", programming_path: "quick", prescription_status: "needs_prescription", capture_fingerprint: fingerprint,
          exercises: [{ exercise_id: exercise.id, name: input.name, ...p }], canonical_ids: [], origin_exercise_id: exercise.id },
      }).select("id,client_id,trainer_id,data").single();
      prior = saved.error?.code === "23505" ? await query() : saved;
      if (prior.error || !matches(prior.data)) throw new CaptureError("Exercise saved; client draft was not confirmed. Retry this same save to finish.", 503, true);
    }
  }
  return { ok: true, exercise: { id: exercise.id, name: exercise.name, slug: exercise.slug }, client_program_id: input.client_program_id, deduped };
}
