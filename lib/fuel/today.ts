import {
  HABITS, confirmedTrainingContext, dailyTargets, fuelDate, phaseForDate,
  type Daily, type DayType, type Journal, type PlanVersion, type Review,
} from "./model";

/** An absent record is evidence; a failed read is not an absent record. */
export type Evidence<T> = {status: "ready"; value: T} | {status: "unavailable"; message: string};
export async function captureEvidence<T>(read: () => Promise<T>, message: string): Promise<Evidence<T>> {
  try { return {status: "ready", value: await read()}; }
  catch { return {status: "unavailable", message}; }
}
export type TodayVersion = Pick<PlanVersion, "id" | "client_id" | "revision" | "content">;
export type ReleasedFuel = {kind: "none"} | {kind: "paused"; sequence: number}
  | {kind: "released"; sequence: number; version: TodayVersion};
export type TodaySession = {
  id: string; client_id: string; scheduled_at: string; status: string;
  session_type: string; duration_minutes: number | null;
};
export type TodayCheckin = {entry: Journal; response: Review | null};
export type FuelTodayData = {
  clientId: string; date: string; now: string;
  plan: Evidence<ReleasedFuel>; daily: Evidence<Journal | null>;
  sessions: Evidence<TodaySession[]>; nextSession: Evidence<TodaySession | null>;
  checkin: Evidence<TodayCheckin | null>;
};
export const HABIT_LABELS = {
  protein: "Protein", fuel: "Fuel plan", water: "Water", steps: "Steps / movement",
  sleep: "Sleep", training: "Training",
};

/** A client reports the actual day. A booking describes the planned day only. */
export function todayDayContext(daily: Evidence<Journal | null>, sessions: Evidence<TodaySession[]>, date: string) {
  const booked = sessions.status === "ready" && confirmedTrainingContext(sessions.value, date);
  if (daily.status === "unavailable") {
    return {day: "unclassified" as DayType, source: "unavailable", conflict: false};
  }
  const reported = (daily.value?.payload as Daily | undefined)?.day_type;
  if (reported === "rest" || reported === "training") {
    return {day: reported, source: "client_reported", conflict: reported === "rest" && booked};
  }
  if (sessions.status === "unavailable") {
    return {day: "unclassified" as DayType, source: "unavailable", conflict: false};
  }
  return {day: (booked ? "training" : "unclassified") as DayType,
    source: booked ? "calendar_planned" : "not_reported", conflict: false};
}

export function buildFuelToday(data: FuelTodayData) {
  const released = data.plan.status === "ready" ? data.plan.value : null;
  const version = released?.kind === "released" ? released.version : null;
  const phase = version ? phaseForDate(version.content, data.date) : null;
  const active = version && phase ? version : null;
  const daily = data.daily.status === "ready" ? data.daily.value : null;
  const context = todayDayContext(data.daily, data.sessions, data.date);
  const targets = active ? dailyTargets(active.content, data.date, context.day) : null;
  // Do not judge yesterday's prescription against today's newly released version.
  const earlierPlan = Boolean(daily && version && daily.plan_version_id !== version.id);
  const habits = active ? HABITS.filter(h => active.content.habits.includes(h)) : [];
  const payload = daily?.payload as Daily | undefined;
  const score = data.daily.status === "unavailable" || earlierPlan ? null : {
    assigned: habits.length,
    reported: habits.filter(h => payload?.habits[h] === "met" || payload?.habits[h] === "missed").length,
    met: habits.filter(h => payload?.habits[h] === "met").length,
    notDue: habits.filter(h => payload?.habits[h] === "not_due").length,
    unreported: habits.filter(h => payload?.habits[h] == null).length,
  };
  const next = data.nextSession.status === "ready" ? data.nextSession.value : null;
  const nextIsToday = Boolean(next && fuelDate(new Date(next.scheduled_at)) === data.date);
  const checkin = data.checkin.status === "ready" ? data.checkin.value : null;
  const reviewDue = Boolean(data.checkin.status === "ready" && active?.content.review_on && active.content.review_on <= data.date
    && (!checkin || checkin.entry.entry_date < active.content.review_on));
  let action = {label: "Open my training", href: "/plan", reload: false};
  if (data.plan.status === "unavailable" || data.daily.status === "unavailable") {
    action = {label: "Refresh Today", href: "/dashboard", reload: true};
  } else if (active && context.day === "unclassified") {
    action = {label: "Choose training or rest day", href: "/fuel#fuel-daily", reload: false};
  } else if (earlierPlan) {
    action = {label: "Review my updated plan", href: "/fuel#fuel-plan", reload: false};
  } else if (checkin?.response && ["contact", "referral"].includes(checkin.response.disposition)) {
    action = {label: "Read my coach's response", href: "/fuel#fuel-checkins", reload: false};
  } else if (nextIsToday && next?.session_type === "training") {
    action = {label: "Open today's training", href: "/plan", reload: false};
  } else if (active && score && score.unreported > 0) {
    action = {label: "Report today's habits", href: "/fuel#fuel-daily", reload: false};
  } else if (reviewDue) {
    action = {label: "Share a coach check-in", href: "/fuel#fuel-checkins", reload: false};
  } else if (active) {
    action = {label: "Open my Fuel plan", href: "/fuel#fuel-plan", reload: false};
  }
  return {released, version, phase, active, daily, context, targets, earlierPlan, habits,
    score, next, nextIsToday, checkin, reviewDue, action,
    guidance: active?.content.guidance ?? ""};
}
