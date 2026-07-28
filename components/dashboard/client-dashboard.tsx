import Link from "next/link";
import {
  Calendar,
  TrendingUp,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CancelSessionButton } from "@/components/sessions/cancel-session-button";
import { nextAssessmentReminder } from "@/lib/queries/assessment-reminder";

/**
 * Client Dashboard — mobile-first, light theme.
 * Queries scoped via RLS to auth.uid().
 */
export async function ClientDashboard({ fullName }: { fullName: string }) {
  const firstName = fullName.split(" ")[0];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Time bounds for the week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: nextSession },
    { data: weekSessions },
    { data: mobility },
    { data: completionsThisWeek },
    { data: latestBodyComp },
    { data: oldestBodyComp },
    { data: lastAssessment },
  ] = await Promise.all([
    // Next upcoming session
    supabase
      .from("sessions")
      .select(
        `id, scheduled_at, session_type, duration_minutes, programs(name),
         profiles:trainer_id!inner(full_name)`
      )
      .eq("client_id", user.id)
      .gte("scheduled_at", now.toISOString())
      .in("status", ["scheduled", "confirmed"])
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // This week's sessions
    supabase
      .from("sessions")
      .select("id, scheduled_at, status")
      .eq("client_id", user.id)
      .gte("scheduled_at", startOfWeek.toISOString())
      .lt("scheduled_at", endOfWeek.toISOString())
      .order("scheduled_at", { ascending: true }),
    // Active mobility assignment
    supabase
      .from("mobility_assignments")
      .select("id, name, duration_minutes, frequency")
      .eq("client_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Mobility completions this week
    supabase
      .from("mobility_completions")
      .select("id, completed_on")
      .eq("client_id", user.id)
      .gte("completed_on", startOfWeek.toISOString().slice(0, 10)),
    // Latest body comp
    supabase
      .from("body_comp_records")
      .select("recorded_at, weight_lb, body_fat_pct")
      .eq("client_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Oldest body comp (for trend)
    supabase
      .from("body_comp_records")
      .select("recorded_at, weight_lb, body_fat_pct")
      .eq("client_id", user.id)
      .order("recorded_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("assessments")
      .select("assessment_date")
      .eq("client_id", user.id)
      .order("assessment_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const reminder = nextAssessmentReminder(
    (lastAssessment as any)?.assessment_date ?? null
  );

  // Build the week strip
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = now.getDay();
  const weekStrip = dayLabels.map((label, idx) => {
    const dayDate = new Date(startOfWeek);
    dayDate.setDate(startOfWeek.getDate() + idx);
    const isPast = idx < today;
    const isToday = idx === today;
    const sessionsThatDay = (weekSessions ?? []).filter((s: any) => {
      const sd = new Date(s.scheduled_at);
      return sd.toDateString() === dayDate.toDateString();
    });
    const hasSession = sessionsThatDay.length > 0;
    const isComplete = sessionsThatDay.some(
      (s: any) => s.status === "completed"
    );
    return {
      day: label,
      status: isComplete
        ? ("complete" as const)
        : isToday
        ? ("today" as const)
        : hasSession
        ? ("upcoming" as const)
        : ("rest" as const),
      label: isPast ? "—" : isToday ? "today" : hasSession ? "session" : "rest",
    };
  });

  // Mobility progress (target = 5 days/wk by default)
  const mobilityCompletedThisWeek = (completionsThisWeek ?? []).length;
  const mobilityTarget = 5;

  // Body comp delta
  const bodyFatDelta =
    latestBodyComp?.body_fat_pct && oldestBodyComp?.body_fat_pct &&
    latestBodyComp.recorded_at !== oldestBodyComp.recorded_at
      ? Number(latestBodyComp.body_fat_pct) - Number(oldestBodyComp.body_fat_pct)
      : null;

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // One line that reflects where they actually are, so the top of the app says
  // something true rather than the same greeting every day.
  const completedThisWeek = (weekSessions ?? []).filter(
    (s: any) => s.status === "completed"
  ).length;
  const headline = nextSession
    ? `You're training ${formatSessionDate(new Date(nextSession.scheduled_at)).toLowerCase()}.`
    : completedThisWeek > 0
      ? `${completedThisWeek} session${completedThisWeek === 1 ? "" : "s"} in this week. Book your next one.`
      : "Nothing on the books yet — let's get you in.";

  return (
    <div className="flex flex-col gap-4">
      {/* Welcome band — the studio's own space and voice, so opening the app
          feels like arriving somewhere rather than loading a list. */}
      <div className="relative -mx-4 -mt-4 mb-1 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/studio-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17191c] via-[#17191c]/85 to-[#17191c]/35" />
        <div className="relative px-5 pt-8 pb-7">
          <p
            className="text-[11px] uppercase text-white/55"
            style={{ letterSpacing: "0.2em" }}
          >
            {greeting}
          </p>
          <h1
            className="text-4xl font-bold text-white leading-[1.05] mt-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {firstName}.
          </h1>
          <p className="prose-ims text-sm text-white/75 mt-2 max-w-[28ch]">
            {headline}
          </p>
        </div>
      </div>

      {/* Next session card */}
      {nextSession ? (
        <>
        <div
          className="rounded-xl bg-navy text-cream p-5 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-cream-faint">
                Next Session
              </div>
              <div className="mt-1.5 text-xl font-semibold">
                {formatSessionDate(new Date(nextSession.scheduled_at))} ·{" "}
                {new Date(nextSession.scheduled_at).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-sm text-cream-dim mt-1">
                with {(nextSession as any).profiles?.full_name?.split(" ")[0] ?? "your coach"}
              </div>
              {(nextSession as any).programs?.name && (
                <div className="text-sm text-sky-light mt-2">
                  {(nextSession as any).programs.name}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="-mt-2 px-1">
          <CancelSessionButton
            sessionId={nextSession.id}
            scheduledAt={nextSession.scheduled_at}
          />
        </div>
        </>
      ) : (
        <Link
          href="/book"
          className="rounded-xl bg-white border border-line p-5 text-center block active:scale-[0.98] transition-transform"
        >
          <div className="text-xs uppercase tracking-wider text-ink/60 mb-1.5">
            No upcoming sessions
          </div>
          <p className="text-sm text-sky font-medium">Book a session →</p>
        </Link>
      )}

      <Link
        href="/book"
        className="rounded-xl border border-sky/30 bg-sky/5 px-4 py-3 text-sm text-sky font-medium text-center active:scale-[0.98] transition-transform"
      >
        + Book a session
      </Link>

      {/* This week */}
      <div className="rounded-xl bg-white border border-line p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
            This Week
          </h2>
          <Calendar className="h-4 w-4 text-ink/40" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekStrip.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="text-xs text-ink/60">{day.day}</div>
              <div
                className={`h-12 w-full rounded-md flex items-center justify-center text-xs font-medium ${
                  day.status === "complete"
                    ? "bg-status-optimal/15 text-status-optimal"
                    : day.status === "today"
                    ? "bg-sky text-white ring-2 ring-sky/30 ring-offset-2 ring-offset-white"
                    : day.status === "rest"
                    ? "bg-paper-deep text-ink/40"
                    : "bg-paper-deep/50 text-ink/60 border border-line"
                }`}
              >
                {day.status === "complete" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  day.label
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Re-assessment reminder */}
      {reminder && reminder.status !== "upcoming" && (
        <div
          className={`rounded-2xl border p-4 ${
            reminder.status === "overdue"
              ? "border-status-moderate/35 bg-status-moderate/10"
              : reminder.status === "due"
                ? "border-sky/40 bg-sky/10"
                : "border-divider bg-white"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">
                {reminder.milestoneWeek}-Week Check-In
              </div>
              <p className="text-xs text-ink/70 mt-0.5">
                {reminder.label}. Re-assessments track how much you&apos;ve
                improved — your movement, strength, and pain levels.
              </p>
            </div>
          </div>
          <a
            href={`/schedule/standing?reassess=1`}
            className="inline-flex items-center gap-1.5 mt-3 rounded-lg bg-sky text-white text-sm font-medium px-3 py-2"
          >
            Add to my next session
          </a>
        </div>
      )}

      {/* Mobility homework */}
      {mobility ? (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
              Mobility Homework
            </h2>
            <Activity className="h-4 w-4 text-ink/40" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-medium text-ink">
                {mobility.name}
              </div>
              <div className="text-xs text-ink/60 mt-0.5">
                {mobility.duration_minutes} minutes · {mobility.frequency}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink/60">This week</div>
              <div className="text-base font-semibold text-ink">
                {mobilityCompletedThisWeek}/{mobilityTarget}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {Array.from({ length: mobilityTarget }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < mobilityCompletedThisWeek
                    ? "bg-status-optimal"
                    : "bg-paper-deep"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            className="w-full rounded-md bg-sky text-white text-sm font-medium py-2.5 active:scale-[0.99] transition-transform"
          >
            Mark today complete
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
              Mobility Homework
            </h2>
            <Activity className="h-4 w-4 text-ink/40" />
          </div>
          <p className="text-sm text-ink/60 italic">
            Your coach hasn't assigned mobility homework yet.
          </p>
        </div>
      )}

      {/* Progress highlights */}
      {(latestBodyComp || bodyFatDelta !== null) && (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
              Recent Progress
            </h2>
            <TrendingUp className="h-4 w-4 text-ink/40" />
          </div>
          <ul className="space-y-2.5">
            {latestBodyComp?.weight_lb && (
              <li className="flex items-center justify-between">
                <span className="text-sm text-ink/80">Latest weight</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-ink">
                    {latestBodyComp.weight_lb} lb
                  </div>
                </div>
              </li>
            )}
            {bodyFatDelta !== null && (
              <li className="flex items-center justify-between">
                <span className="text-sm text-ink/80">Body fat</span>
                <div className="text-right">
                  <div
                    className={`text-sm font-semibold ${
                      bodyFatDelta < 0 ? "text-status-optimal" : "text-ink"
                    }`}
                  >
                    {bodyFatDelta > 0 ? "+" : ""}
                    {bodyFatDelta.toFixed(1)}%
                  </div>
                  <div className="text-xs text-ink/40">since first scan</div>
                </div>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatSessionDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sessionDay = new Date(date);
  sessionDay.setHours(0, 0, 0, 0);

  if (sessionDay.getTime() === today.getTime()) return "Today";
  if (sessionDay.getTime() === tomorrow.getTime()) return "Tomorrow";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
