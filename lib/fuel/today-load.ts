import {z} from "zod";
import type {createClient} from "@/lib/supabase/server";
import {readCompleteEvidence} from "@/lib/migration/complete-read";
import {ptWallClockToUtc} from "@/lib/recurring";
import {FUEL_UUID, fuelDate, shiftDate, validDate, type Journal, type Review} from "./model";
import {fuelPlanSchema, fuelDailySchema, fuelCheckinSchema} from "./validation";
import {captureEvidence, type FuelTodayData, type ReleasedFuel, type TodaySession, type TodayCheckin} from "./today";

type Database = Awaited<ReturnType<typeof createClient>>;
const uuid = z.string().uuid();
const sequence = z.number().int().positive();
const releaseSchema = z.object({id: uuid, client_id: uuid, version_id: uuid.nullable(), sequence});
const versionSchema = z.object({id: uuid, client_id: uuid, revision: sequence, content: fuelPlanSchema});
export const todaySessionSchema = z.object({
  id: uuid, client_id: uuid, scheduled_at: z.string().datetime({offset: true}),
  session_type: z.string().min(1), status: z.string().min(1),
  duration_minutes: z.number().int().positive().max(480).nullable(),
});
const journalSchema = z.object({
  id: uuid, client_id: uuid, kind: z.enum(["daily", "weekly"]), entry_date: z.string().refine(validDate),
  revision: sequence, payload: z.unknown(), plan_version_id: uuid.nullable(), created_at: z.string(),
});
const responseSchema = z.object({
  id: uuid, client_id: uuid, entry_id: uuid, note: z.string(),
  disposition: z.enum(["reviewed", "contact", "referral"]), created_at: z.string(),
});
const journalColumns = "id,client_id,kind,entry_date,revision,payload,plan_version_id,created_at";
const sessionColumns = "id,client_id,scheduled_at,status,session_type,duration_minutes";

/** SQL errors, malformed rows and mismatched identities all stay unavailable. */
function row<T>(result: {data: unknown; error: unknown}, schema: z.ZodType<T>): T | null {
  if (result.error || result.data === undefined) throw Error("Evidence query failed.");
  return result.data === null ? null : schema.parse(result.data);
}
function own<T extends {client_id: string}>(value: T, clientId: string): T {
  if (value.client_id !== clientId) throw Error("Evidence identity mismatch.");
  return value;
}
function parseJournal(value: unknown, clientId: string, kind: "daily" | "weekly"): Journal {
  const entry = own(journalSchema.parse(value), clientId);
  if (entry.kind !== kind) throw Error("Journal kind mismatch.");
  const payload = kind === "daily" ? fuelDailySchema.parse(entry.payload) : fuelCheckinSchema.parse(entry.payload);
  return {...entry, payload};
}
async function releasedPlan(db: Database, clientId: string): Promise<ReleasedFuel> {
  const latest = () => db.from("fuel_plan_releases").select("id,client_id,version_id,sequence")
    .eq("client_id", clientId).order("sequence", {ascending: false}).limit(1).maybeSingle();
  const release = row(await latest(), releaseSchema);
  if (!release) return {kind: "none"};
  own(release, clientId);
  if (release.version_id === null) return {kind: "paused", sequence: release.sequence};
  // Fetch the exact release only: no private drafts, source references or PDFs.
  const version = row(await db.from("fuel_plan_versions").select("id,client_id,revision,content")
    .eq("client_id", clientId).eq("id", release.version_id).maybeSingle(), versionSchema);
  if (!version || version.id !== release.version_id) throw Error("Released plan missing.");
  own(version, clientId);
  const current = row(await latest(), releaseSchema);
  if (!current || current.id !== release.id || current.sequence !== release.sequence
    || current.version_id !== release.version_id || current.client_id !== clientId) {
    throw Error("Plan release changed during the read.");
  }
  return {kind: "released", sequence: release.sequence, version};
}

/** Caller supplies its authenticated client identity. Each section fails independently. */
export async function loadFuelToday(db: Database, clientId: string, now = new Date()): Promise<FuelTodayData> {
  if (!FUEL_UUID.test(clientId) || !Number.isFinite(now.getTime())) throw Error("Invalid Today identity or clock.");
  const date = fuelDate(now);
  const start = ptWallClockToUtc(date, "00:00").toISOString();
  const end = ptWallClockToUtc(shiftDate(date, 1), "00:00").toISOString();
  const [plan, daily, sessions, nextSession, checkin] = await Promise.all([
    captureEvidence(() => releasedPlan(db, clientId), "Your released Fuel plan could not be loaded. No targets were inferred."),
    captureEvidence(async () => {
      const result = await db.from("fuel_journal_entries").select(journalColumns).eq("client_id", clientId)
        .eq("kind", "daily").eq("entry_date", date).order("revision", {ascending: false}).limit(1).maybeSingle();
      if (result.error || result.data === undefined) throw Error("Daily read failed.");
      if (result.data === null) return null;
      const entry = parseJournal(result.data, clientId, "daily");
      if (entry.entry_date !== date) throw Error("Daily date mismatch.");
      return entry;
    }, "Today's reported habits could not be loaded. No completion count was assumed."),
    captureEvidence(async (): Promise<TodaySession[]> => {
      const entries = await readCompleteEvidence<TodaySession>((a, b) => db.from("sessions")
        .select(sessionColumns, {count: "exact"}).eq("client_id", clientId)
        .gte("scheduled_at", start).lt("scheduled_at", end)
        .in("status", ["scheduled", "confirmed", "completed"]).order("id").range(a, b));
      return entries.map(value => {
        const session = own(todaySessionSchema.parse(value), clientId);
        if (! ["scheduled", "confirmed", "completed"].includes(session.status) || fuelDate(new Date(session.scheduled_at)) !== date) throw Error("Schedule date mismatch.");
        return session;
      });
    }, "Today's calendar could not be checked. An empty calendar was not assumed."),
    captureEvidence(async () => {
      const value = row(await db.from("sessions").select(sessionColumns).eq("client_id", clientId)
        .gte("scheduled_at", now.toISOString()).in("status", ["scheduled", "confirmed"])
        .order("scheduled_at", {ascending: true}).order("id").limit(1).maybeSingle(), todaySessionSchema);
      if (!value) return null;
      own(value, clientId);
      if (Date.parse(value.scheduled_at) < now.getTime() || !["scheduled", "confirmed"].includes(value.status)) {
        throw Error("Next session evidence mismatch.");
      }
      return value;
    }, "Your next session could not be loaded. This does not mean nothing is booked."),
    captureEvidence(async (): Promise<TodayCheckin | null> => {
      const result = await db.from("fuel_journal_entries").select(journalColumns).eq("client_id", clientId)
        .eq("kind", "weekly").gte("entry_date", shiftDate(date, -27)).lte("entry_date", date)
        .order("entry_date", {ascending: false}).order("revision", {ascending: false}).limit(1).maybeSingle();
      if (result.error || result.data === undefined) throw Error("Check-in read failed.");
      if (result.data === null) return null;
      const entry = parseJournal(result.data, clientId, "weekly");
      if (entry.entry_date < shiftDate(date, -27) || entry.entry_date > date) throw Error("Check-in date mismatch.");
      const response = row(await db.from("fuel_coach_reviews").select("id,client_id,entry_id,note,disposition,created_at")
        .eq("client_id", clientId).eq("entry_id", entry.id).maybeSingle(), responseSchema);
      if (response) {
        own(response, clientId);
        if (response.entry_id !== entry.id) throw Error("Coach response mismatch.");
      }
      return {entry, response: response as Review | null};
    }, "Your coach check-in status could not be loaded. Review status is unknown."),
  ]);
  return {clientId, date, now: now.toISOString(), plan, daily, sessions, nextSession, checkin};
}
