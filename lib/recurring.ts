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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Invalid Pacific date or time");
  }
  const naive = Date.parse(`${ymd}T${time}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 10) !== ymd) {
    throw new Error("Invalid Pacific date");
  }
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  // Pacific time uses UTC-7/-8 for supported modern booking dates. Test both
  // actual instants. In the repeated fall-back hour choose the earlier instant;
  // reject the nonexistent spring-forward hour rather than silently moving it.
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(naive + offsetHours * 3_600_000);
    const parts = Object.fromEntries(format.formatToParts(candidate).map(p => [p.type, p.value]));
    if (`${parts.year}-${parts.month}-${parts.day}` === ymd && `${parts.hour}:${parts.minute}` === time) return candidate;
  }
  throw new Error("This Pacific time does not exist due to daylight saving time");
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

export function buildSeriesOccurrences(opts: {slots:RecurringSlot[];startDate:string;endDate?:string|null;intervalWeeks?:number;horizonWeeks?:number;now?:Date}):{occurrences:string[];generatedUntil:string}{
 const now=opts.now??new Date(),today=ymdInPT(now),horizonWeeks=opts.horizonWeeks??8,interval=opts.intervalWeeks??1;
 const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T12:00:00Z"))&&new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
 if(!validDate(opts.startDate)||opts.endDate&&(!validDate(opts.endDate)||opts.endDate<opts.startDate)||!Number.isInteger(interval)||interval<1||interval>4||!Number.isInteger(horizonWeeks)||horizonWeeks<1||horizonWeeks>52||!opts.slots.length||opts.slots.length>4)throw Error("Invalid recurring range or frequency.");
 if(opts.slots.some(s=>!Number.isInteger(s.weekday)||s.weekday<0||s.weekday>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))||new Set(opts.slots.map(s=>s.weekday+":"+s.time)).size!==opts.slots.length)throw Error("Invalid or duplicate recurring slot.");
 const start=opts.startDate>today?opts.startDate:today;let day=start;
 const horizon=addDays(start,horizonWeeks*7),generatedUntil=opts.endDate&&opts.endDate<horizon?opts.endDate:horizon;
 const monday=(date:string)=>addDays(date,-((new Date(date+"T12:00:00Z").getUTCDay()+6)%7));
 const anchor=Date.parse(monday(opts.startDate)+"T12:00:00Z"),occurrences:string[]=[];
 while(day<=generatedUntil){const wd=weekdayInPT(day),week=Math.round((Date.parse(monday(day)+"T12:00:00Z")-anchor)/604800000);
  if(week%interval===0)for(const slot of opts.slots)if(slot.weekday===wd){const instant=ptWallClockToUtc(day,slot.time);if(instant>now)occurrences.push(instant.toISOString());}
  day=addDays(day,1);
 }
 return {occurrences:occurrences.sort(),generatedUntil};
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
  end_date?: string | null;
  interval_weeks?: number;
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
  const today=ymdInPT(new Date()),start=series.start_date>today?series.start_date:today;
  const {data,error}=await svc.rpc("fill_recurring_window",{p_series_id:series.id,p_until:addDays(start,horizonWeeks*7)});
  if(error)throw Error("Recurring extension failed; no partial series window was committed.");
  if(typeof data!=="number"||!Number.isInteger(data)||data<0)throw Error("Recurring extension receipt unavailable.");
  return data;
}

/** Roll every active series forward — used by the cron. */
export async function generateAllActiveSeries(
  svc: SupabaseClient,
  horizonWeeks = 8
): Promise<{ series: number; created: number; failed: string[] }> {
  const { data: list, error: listError } = await svc
    .from("recurring_series")
    .select(
      "id, client_id, trainer_id, session_type, duration_minutes, location, slots, status, generated_until, start_date"
    )
    .eq("status", "active");

  if (listError) throw new Error(`Recurring series lookup failed: ${listError.message}`);
  let created = 0;const failed:string[]=[];
  for (const s of list ?? []) {
    try{created += await generateSeriesSessions(svc, s as SeriesRow, horizonWeeks);}catch{failed.push(s.id);}
  }
  return { series: (list ?? []).length, created, failed };
}
