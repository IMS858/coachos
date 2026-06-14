import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

// Always fetch live data so newly-created records appear immediately.
export const dynamic = "force-dynamic";


/**
 * /schedule — multi-trainer day view with a week strip.
 *
 * Columns = every profile with role owner/trainer (Jason / Gabriel).
 * Rows = 6:00 AM – 8:00 PM, Pacific time.
 * Session blocks are color-coded by session_type and click through to detail.
 * ?date=YYYY-MM-DD selects the day; arrows move a week at a time.
 */

const TZ = "America/Los_Angeles";
const DAY_START_HOUR = 6; // 6:00 AM
const DAY_END_HOUR = 20; // 8:00 PM
const PX_PER_30MIN = 36;
const TOTAL_HALF_HOURS = (DAY_END_HOUR - DAY_START_HOUR) * 2;

const TYPE_STYLES: Record<string, string> = {
  training: "bg-sky-500/15 border-sky-400/50 text-sky-100",
  mobility: "bg-indigo-500/15 border-indigo-400/50 text-indigo-100",
  pilates: "bg-emerald-500/15 border-emerald-400/50 text-emerald-100",
  recovery: "bg-amber-500/15 border-amber-400/50 text-amber-100",
  assessment: "bg-violet-500/15 border-violet-400/50 text-violet-100",
  body_comp: "bg-pink-500/15 border-pink-400/50 text-pink-100",
};

function todayInPt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** "-07:00" or "-08:00" for the given calendar date (handles DST). */
function ptOffset(ymd: string): string {
  const probe = new Date(`${ymd}T12:00:00Z`);
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  return part?.replace("GMT", "") || "-08:00";
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing ymd. */
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun
  return addDays(ymd, -((dow + 6) % 7));
}

function ptTimeParts(iso: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

function ptDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(iso)
  );
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!viewer || viewer.role === "client") redirect("/dashboard");

  const params = await searchParams;
  const today = todayInPt();
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? (params.date as string)
    : today;

  const monday = mondayOf(selected);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Trainers = staff profiles (owner coaches too)
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["owner", "trainer"])
    .order("role", { ascending: false }) // owner first
    .order("full_name");
  const trainers = staff ?? [];

  // Fetch the whole visible week of sessions (powers day-strip counts too)
  const weekStart = `${monday}T00:00:00${ptOffset(monday)}`;
  const afterWeek = addDays(monday, 7);
  const weekEnd = `${afterWeek}T00:00:00${ptOffset(afterWeek)}`;

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, client_id, trainer_id, scheduled_at, duration_minutes, session_type, status"
    )
    .gte("scheduled_at", weekStart)
    .lt("scheduled_at", weekEnd)
    .neq("status", "cancelled")
    .order("scheduled_at");
  const weekSessions = sessions ?? [];

  // Resolve client names in one extra query (no join ambiguity)
  const clientIds = Array.from(new Set(weekSessions.map((s) => s.client_id)));
  let clientNames: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: names } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", clientIds);
    clientNames = Object.fromEntries(
      (names ?? []).map((n) => [n.id, n.full_name])
    );
  }

  const dayCounts: Record<string, number> = {};
  for (const s of weekSessions) {
    const d = ptDateOf(s.scheduled_at);
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  }

  const daySessions = weekSessions.filter(
    (s) => ptDateOf(s.scheduled_at) === selected
  );

  const hourLabels = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i
  );

  const selectedTitle = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${selected}T00:00:00Z`));

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
            <p className="text-sm text-cream-dim mt-1">
              {selectedTitle}
              {selected === today && (
                <span className="text-sky-light"> · Today</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/schedule?date=${addDays(selected, -7)}`}>
              <Button variant="ghost" size="icon" title="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/schedule?date=${today}`}>
              <Button variant="secondary">
                <CalendarDays className="h-4 w-4" />
                Today
              </Button>
            </Link>
            <Link href={`/schedule?date=${addDays(selected, 7)}`}>
              <Button variant="ghost" size="icon" title="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/schedule/standing">
              <Button variant="secondary">
                <CalendarDays className="h-4 w-4" />
                Standing
              </Button>
            </Link>
            <Link href="/sessions/new">
              <Button>
                <Plus className="h-4 w-4" />
                New session
              </Button>
            </Link>
          </div>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const isSelected = d === selected;
            const isToday = d === today;
            const count = dayCounts[d] ?? 0;
            const dayName = new Intl.DateTimeFormat("en-US", {
              timeZone: "UTC",
              weekday: "short",
            }).format(new Date(`${d}T00:00:00Z`));
            return (
              <Link
                key={d}
                href={`/schedule?date=${d}`}
                className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                  isSelected
                    ? "border-sky-400/60 bg-sky-500/15"
                    : "border-divider bg-navy-soft hover:bg-navy-elev"
                }`}
              >
                <div className="text-[11px] uppercase tracking-wide text-cream-faint">
                  {dayName}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    isToday ? "text-sky-light" : "text-cream"
                  }`}
                >
                  {Number(d.slice(8))}
                </div>
                <div className="text-[11px] text-cream-faint h-4">
                  {count > 0 ? `${count} session${count === 1 ? "" : "s"}` : ""}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Day grid */}
        <div className="rounded-xl border border-divider bg-navy-soft overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Trainer headers */}
            <div
              className="grid border-b border-divider"
              style={{
                gridTemplateColumns: `64px repeat(${Math.max(trainers.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              <div />
              {trainers.map((t) => {
                const n = daySessions.filter(
                  (s) => s.trainer_id === t.id
                ).length;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 px-4 py-3 border-l border-divider"
                  >
                    <Avatar name={t.full_name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-cream truncate">
                        {t.full_name}
                      </div>
                      <div className="text-[11px] text-cream-faint">
                        {n} session{n === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                );
              })}
              {trainers.length === 0 && (
                <div className="px-4 py-3 text-sm text-cream-faint border-l border-divider">
                  No staff profiles yet.
                </div>
              )}
            </div>

            {/* Time gutter + columns */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `64px repeat(${Math.max(trainers.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              {/* Gutter */}
              <div
                className="relative"
                style={{ height: TOTAL_HALF_HOURS * PX_PER_30MIN }}
              >
                {hourLabels.map((h, i) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-cream-faint"
                    style={{ top: i * 2 * PX_PER_30MIN }}
                  >
                    {i === 0
                      ? ""
                      : h === 12
                        ? "12 PM"
                        : h > 12
                          ? `${h - 12} PM`
                          : `${h} AM`}
                  </div>
                ))}
              </div>

              {/* One column per trainer */}
              {trainers.map((t) => (
                <div
                  key={t.id}
                  className="relative border-l border-divider"
                  style={{ height: TOTAL_HALF_HOURS * PX_PER_30MIN }}
                >
                  {/* Hour lines */}
                  {hourLabels.map((h, i) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-divider/50"
                      style={{ top: i * 2 * PX_PER_30MIN }}
                    />
                  ))}

                  {/* Session blocks */}
                  {daySessions
                    .filter((s) => s.trainer_id === t.id)
                    .map((s) => {
                      const { hour, minute } = ptTimeParts(s.scheduled_at);
                      const startHalf =
                        (hour - DAY_START_HOUR) * 2 + (minute >= 30 ? 1 : 0);
                      if (startHalf < 0 || startHalf >= TOTAL_HALF_HOURS)
                        return null;
                      const spanHalves = Math.max(
                        1,
                        Math.round((s.duration_minutes ?? 60) / 30)
                      );
                      const style = TYPE_STYLES[s.session_type] ?? TYPE_STYLES.training;
                      const dimmed =
                        s.status === "late_cancelled" || s.status === "no_show";
                      return (
                        <Link
                          key={s.id}
                          href={`/sessions/${s.id}`}
                          className={`absolute inset-x-1 rounded-md border px-2 py-1 text-xs overflow-hidden transition-opacity hover:opacity-90 ${style} ${
                            dimmed ? "opacity-40 line-through" : ""
                          }`}
                          style={{
                            top: startHalf * PX_PER_30MIN + 2,
                            height: spanHalves * PX_PER_30MIN - 4,
                          }}
                        >
                          <div className="font-medium truncate">
                            {clientNames[s.client_id] ?? "Client"}
                          </div>
                          <div className="opacity-75 truncate">
                            {fmtTime(s.scheduled_at)} ·{" "}
                            {String(s.session_type).replace("_", " ")}
                            {s.status === "completed" && " ✓"}
                          </div>
                        </Link>
                      );
                    })}
                </div>
              ))}
              {trainers.length === 0 && (
                <div
                  className="border-l border-divider"
                  style={{ height: TOTAL_HALF_HOURS * PX_PER_30MIN }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-cream-faint">
          {Object.entries(TYPE_STYLES).map(([type, cls]) => (
            <span key={type} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm border ${cls}`} />
              {type.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
