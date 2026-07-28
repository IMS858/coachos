/**
 * Recurring (standing) appointment generation.
 *
 * A series stores a weekly pattern (slots: { weekday, time }) and we roll the
 * calendar forward, creating a `sessions` row for each slot occurrence up to a
 * horizon (default 8 weeks ahead). Generation is idempotent: a unique index on
 * (recurring_series_id, scheduled_at) plus an existence check means re-running
 * never double-books.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const TZ = "America/Los_Angeles";

/** One slot in the weekly pattern. weekday: 0=Sun … 6=Sat (JS getDay). */
export interface RecurringSlot {
  weekday: number;
  time: string; // "HH:MM" 24h, PT wall clock
}

/**
 * Convert a PT wall-clock date+time to the correct UTC Date, handling DST.
 * We find the offset PT had at that moment and apply it.
 */
export function ptWallClockToUtc(ymd: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  // Start from the naive UTC guess, then correct by PT's offset that day.
  const naive = new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  // What time does that UTC instant show in PT?
  const ptParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(naive);
  const ptHour = Number(ptParts.find((p) => p.type === "hour")?.value ?? "0");
  // Offset in hours between our intended PT hour and what UTC-as-PT shows.
  // PT is behind UTC, so we add the difference back.
  let diff = h - ptHour;
  // Handle wrap-around at midnight (e.g. h=0 vs ptHour=17)
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return new Date(naive.getTime() + diff * 60 * 60 * 1000);
}

/** YYYY-MM-DD for a Date, in PT. */
function ymdInPT(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Add days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** JS weekday (0-6) for a YYYY-MM-DD, evaluated in PT. */
function weekdayInPT(ymd: string): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(new Date(`${ymd}T12:00:00Z`));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export interface SeriesRow {
  id: string;
  client_id: string;
  trainer_id: string;
  session_type: string;
  duration_minutes: number;
  location: string | null;
  slots: RecurringSlot[];
  status: string;
  generated_until: string | null;
  start_date: string;
}

/**
 * Generate sessions for one series up to `horizonWeeks` ahead of today.
 * Returns the number of sessions created.
 */
export async function generateSeriesSessions(
  svc: SupabaseClient,
  series: SeriesRow,
  horizonWeeks = 8
): Promise<number> {
  if (series.status !== "active") return 0;

  const todayPT = ymdInPT(new Date());
  const horizonEnd = addDays(todayPT, horizonWeeks * 7);

  // Start from the later of: series start, day after last generated, or today.
  let cursor = series.start_date > todayPT ? series.start_date : todayPT;
  if (series.generated_until && series.generated_until >= cursor) {
    cursor = addDays(series.generated_until, 1);
  }

  const rows: Array<{
    client_id: string;
    trainer_id: string;
    scheduled_at: string;
    duration_minutes: number;
    session_type: string;
    location: string | null;
    status: string;
    recurring_series_id: string;
  }> = [];

  let day = cursor;
  while (day <= horizonEnd) {
    const wd = weekdayInPT(day);
    for (const slot of series.slots) {
      if (slot.weekday === wd) {
        const when = ptWallClockToUtc(day, slot.time);
        rows.push({
          client_id: series.client_id,
          trainer_id: series.trainer_id,
          scheduled_at: when.toISOString(),
          duration_minutes: series.duration_minutes,
          session_type: series.session_type,
          location: series.location,
          status: "scheduled",
          recurring_series_id: series.id,
        });
      }
    }
    day = addDays(day, 1);
  }

  if (rows.length === 0) {
    await svc
      .from("recurring_series")
      .update({ generated_until: horizonEnd })
      .eq("id", series.id);
    return 0;
  }

  // Idempotency without relying on a partial-index upsert (which can't infer
  // its conflict target): fetch existing slot times for this series in range
  // and skip any we've already created.
  const times = rows.map((r) => r.scheduled_at).sort();
  const { data: existing } = await svc
    .from("sessions")
    .select("scheduled_at")
    .eq("recurring_series_id", series.id)
    .gte("scheduled_at", times[0])
    .lte("scheduled_at", times[times.length - 1]);

  const have = new Set((existing ?? []).map((e: any) => e.scheduled_at));
  const toInsert = rows.filter((r) => !have.has(r.scheduled_at));

  if (toInsert.length === 0) {
    await svc
      .from("recurring_series")
      .update({ generated_until: horizonEnd })
      .eq("id", series.id);
    return 0;
  }

  const { error, count } = await svc
    .from("sessions")
    .insert(toInsert, { count: "exact" });

  if (error) {
    // Surface the real reason instead of silently returning 0.
    console.error("[recurring] insert failed:", error.message, error.details);
    throw new Error(`Session insert failed: ${error.message}`);
  }

  await svc
    .from("recurring_series")
    .update({ generated_until: horizonEnd })
    .eq("id", series.id);

  return count ?? toInsert.length;
}

/** Roll every active series forward — used by the cron. */
export async function generateAllActiveSeries(
  svc: SupabaseClient,
  horizonWeeks = 8
): Promise<{ series: number; created: number }> {
  const { data: list } = await svc
    .from("recurring_series")
    .select(
      "id, client_id, trainer_id, session_type, duration_minutes, location, slots, status, generated_until, start_date"
    )
    .eq("status", "active");

  let created = 0;
  for (const s of list ?? []) {
    created += await generateSeriesSessions(svc, s as SeriesRow, horizonWeeks);
  }
  return { series: (list ?? []).length, created };
}
