import {
  Calendar,
  TrendingUp,
  CheckCircle2,
  Activity,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

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
  ]);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Hi {firstName}
        </h1>
      </div>

      {/* Next session card */}
      {nextSession ? (
        <button
          type="button"
          className="rounded-xl bg-navy text-cream p-5 text-left active:scale-[0.98] transition-transform"
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
            <ChevronRight className="h-5 w-5 text-cream-faint shrink-0 mt-1" />
          </div>
        </button>
      ) : (
        <div className="rounded-xl bg-white border border-line p-5 text-center">
          <div className="text-xs uppercase tracking-wider text-navy/60 mb-1.5">
            No upcoming sessions
          </div>
          <p className="text-sm text-navy/70">
            Talk to your coach to get scheduled.
          </p>
        </div>
      )}

      {/* This week */}
      <div className="rounded-xl bg-white border border-line p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wider">
            This Week
          </h2>
          <Calendar className="h-4 w-4 text-navy/40" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekStrip.map((day, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="text-xs text-navy/60">{day.day}</div>
              <div
                className={`h-12 w-full rounded-md flex items-center justify-center text-xs font-medium ${
                  day.status === "complete"
                    ? "bg-status-optimal/15 text-status-optimal"
                    : day.status === "today"
                    ? "bg-sky text-white ring-2 ring-sky/30 ring-offset-2 ring-offset-white"
                    : day.status === "rest"
                    ? "bg-paper-deep text-navy/40"
                    : "bg-paper-deep/50 text-navy/60 border border-line"
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

      {/* Mobility homework */}
      {mobility ? (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-navy uppercase tracking-wider">
              Mobility Homework
            </h2>
            <Activity className="h-4 w-4 text-navy/40" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-medium text-navy">
                {mobility.name}
              </div>
              <div className="text-xs text-navy/60 mt-0.5">
                {mobility.duration_minutes} minutes · {mobility.frequency}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-navy/60">This week</div>
              <div className="text-base font-semibold text-navy">
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
            className="w-full rounded-md bg-navy text-white text-sm font-medium py-2.5 active:scale-[0.99] transition-transform"
          >
            Mark today complete
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-navy uppercase tracking-wider">
              Mobility Homework
            </h2>
            <Activity className="h-4 w-4 text-navy/40" />
          </div>
          <p className="text-sm text-navy/60 italic">
            Your coach hasn't assigned mobility homework yet.
          </p>
        </div>
      )}

      {/* Progress highlights */}
      {(latestBodyComp || bodyFatDelta !== null) && (
        <div className="rounded-xl bg-white border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-navy uppercase tracking-wider">
              Recent Progress
            </h2>
            <TrendingUp className="h-4 w-4 text-navy/40" />
          </div>
          <ul className="space-y-2.5">
            {latestBodyComp?.weight_lb && (
              <li className="flex items-center justify-between">
                <span className="text-sm text-navy/80">Latest weight</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-navy">
                    {latestBodyComp.weight_lb} lb
                  </div>
                </div>
              </li>
            )}
            {bodyFatDelta !== null && (
              <li className="flex items-center justify-between">
                <span className="text-sm text-navy/80">Body fat</span>
                <div className="text-right">
                  <div
                    className={`text-sm font-semibold ${
                      bodyFatDelta < 0 ? "text-status-optimal" : "text-navy"
                    }`}
                  >
                    {bodyFatDelta > 0 ? "+" : ""}
                    {bodyFatDelta.toFixed(1)}%
                  </div>
                  <div className="text-xs text-navy/40">since first scan</div>
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
