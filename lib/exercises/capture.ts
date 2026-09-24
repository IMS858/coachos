/** Shared, side-effect-free exercise capture contract. No patient/client data on library rows. */
export const CAPTURE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const VIDEO_MIMES = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" } as const;
export const MAX_DEMO_BYTES = 500 * 1024 * 1024;
export const CAPTURE_JOINTS = ["shoulder", "scapula", "hip", "knee", "ankle", "foot", "thoracic_spine", "lumbar_spine", "cervical_spine", "wrist", "elbow"] as const;
export interface CaptureInput {
  request_id: string;
  client_program_id: string | null;
  client_context_id: string | null;
  name: string;
  description: string;
  category: "mobility" | "strength" | "cardio" | "recovery";
  coaching_cues: string[];
  primary_joints: string[];
  video_storage_path: string | null;
  default_prescription: { sets: number | null; reps: string; load: string; rest_seconds: number | null; tempo: string };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid exercise details.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max || /\u0000/.test(value)) throw new Error(`${label} must be text up to ${max} characters.`);
  return value.trim();
}
function integer(value: unknown, label: string, min: number, max: number): number | null {
  if (value === "" || value == null) return null;
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) throw new Error(`${label} must be a whole number.`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be ${min}–${max}.`);
  return n;
}
export function demoPath(actor: string, id: string, extension: string): string {
  if (!CAPTURE_UUID.test(actor) || !CAPTURE_UUID.test(id) || !Object.hasOwn(VIDEO_MIMES, extension)) throw new Error("Invalid demo upload.");
  return `exercise-drafts/${actor}/${id}.${extension}`;
}
export function validateDemoPath(path: string, actor?: string, id?: string): boolean {
  const match = /^exercise-drafts\/([^/]+)\/([^/.]+)\.(mp4|mov|webm)$/.exec(path);
  return !!match && CAPTURE_UUID.test(match[1]) && CAPTURE_UUID.test(match[2]) && (!actor || match[1] === actor) && (!id || match[2] === id);
}
export function videoFileError(file: { name: string; type: string; size: number }, max = MAX_DEMO_BYTES): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.hasOwn(VIDEO_MIMES, extension)) return "Use an MP4, MOV or WebM video.";
  const expected = VIDEO_MIMES[extension as keyof typeof VIDEO_MIMES];
  if (file.type && file.type !== expected) return "Video format and filename do not match. Export an MP4 or MOV and retry.";
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > max) return `Choose a nonempty video under ${max / 1024 / 1024} MB.`;
  return null;
}
export function parseCapture(value: unknown, actor: string): CaptureInput {
  const v = object(value);
  const allowed = new Set(["request_id", "client_program_id", "client_context_id", "name", "description", "category", "coaching_cues", "primary_joints", "video_storage_path", "default_prescription"]);
  if (Object.keys(v).some(k => !allowed.has(k))) throw new Error("Only exercise draft fields can be saved here.");
  if (typeof v.request_id !== "string" || !CAPTURE_UUID.test(v.request_id)) throw new Error("A stable save reference is required.");
  const client = v.client_context_id == null || v.client_context_id === "" ? null : v.client_context_id;
  const program = v.client_program_id == null ? null : v.client_program_id;
  if (client !== null && (typeof client !== "string" || !CAPTURE_UUID.test(client) || typeof program !== "string" || !CAPTURE_UUID.test(program))) throw new Error("Choose a valid client and draft reference.");
  if (client === null && program !== null) throw new Error("Client draft reference needs a client.");
  const name = text(v.name, "Name", 160);
  if (name.length < 2) throw new Error("Give the exercise a name.");
  const category = v.category ?? "mobility";
  if (!["mobility", "strength", "cardio", "recovery"].includes(String(category))) throw new Error("Choose a supported training category.");
  const joints = v.primary_joints;
  if (!Array.isArray(joints) || joints.length < 1 || joints.length > 5 || joints.some(j => !CAPTURE_JOINTS.includes(j))) throw new Error("Choose at least one valid primary joint.");
  const cues = v.coaching_cues ?? [];
  if (!Array.isArray(cues) || cues.length > 8) throw new Error("Use at most eight coaching cues.");
  const video = v.video_storage_path ?? null;
  if (video !== null && (typeof video !== "string" || !validateDemoPath(video, actor, v.request_id))) throw new Error("The video must belong to this coach and this save.");
  const p = object(v.default_prescription ?? {});
  if (Object.keys(p).some(k => !["sets", "reps", "load", "rest_seconds", "tempo"].includes(k))) throw new Error("Invalid prescription fields.");
  return {
    request_id: v.request_id, client_context_id: client as string | null, client_program_id: program as string | null,
    name, description: text(v.description, "Description", 2000), category: category as CaptureInput["category"],
    coaching_cues: cues.map(c => text(c, "Cue", 240)).filter(Boolean), primary_joints: [...new Set(joints as string[])],
    video_storage_path: video as string | null,
    default_prescription: { sets: integer(p.sets, "Sets", 1, 20), reps: text(p.reps, "Reps or time", 40), load: text(p.load, "Load or RPE", 120), rest_seconds: integer(p.rest_seconds, "Rest seconds", 0, 900), tempo: text(p.tempo, "Tempo", 40) },
  };
}
