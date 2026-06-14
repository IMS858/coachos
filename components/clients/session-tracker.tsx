import Link from "next/link";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  CalendarPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * SessionTracker — the headline panel on a client's profile.
 *
 * Pulls three things and stitches them together:
 *   1. Active package plans  → "8 of 12 used, 4 left" progress rings
 *   2. Active subscriptions  → monthly cadence + sessions this month
 *   3. The sessions table     → upcoming + recent history (linked to schedule)
 *
 * No new tables: everything already exists. sessions_used is auto-incremented
 * by the session-complete API, so this view is always live.
 * ------------------------------------------------------------------------- */

const TYPE_DOT: Record<string, string> = {
  training: "bg-sky-400",
  mobility: "bg-indigo-400",
  pilates: "bg-emerald-400",
  recovery: "bg-amber-400",
  assessment: "bg-violet-400",
  body_comp: "bg-pink-400",
};

const TIER_LABEL: Record<string, string> = {
  essentials_2x: "Essentials · 2×/week",
  standard_3x: "Standard · 3×/week",
  premium_4x: "Premium · 4×/week",
  package_6: "6-Session Package",
  package_12: "12-Session Package",
  package_24: "24-Session Package",
  custom: "Custom Plan",
};

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function ProgressRing({
  used,
  total,
  low,
}: {
  used: number;
  total: number;
  low: boolean;
}) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const remaining = Math.max(total - used, 0);
  const stroke = low ? "rgb(248 180 100)" : "rgb(96 178 255)";
  return (
    <div className="relative h-[64px] w-[64px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="rgb(255 255 255 / 0.08)"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none text-cream">
          {remaining}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-cream-faint">
          left
        </span>
      </div>
    </div>
  );
}

export async function SessionTracker({ clientId }: { clientId: string }) {
  const supabase = await createClient();

  const { data: plans } = await supabase
    .from("plans")
    .select(
      "id, kind, tier, custom_label, status, total_sessions, sessions_used, monthly_rate_cents, sessions_per_week, expires_at"
    )
    .eq("client_id", clientId)
    .eq("status", "active");

  const packages = (plans ?? []).filter((p) => p.kind === "package");
  const subscriptions = (plans ?? []).filter((p) => p.kind === "subscription");

  const nowIso = new Date().toISOString();

  // Upcoming (next 5) and recent completed (last 5)
  const { data: upcoming } = await supabase
    .from("sessions")
    .select("id, scheduled_at, session_type, status, duration_minutes")
    .eq("client_id", clientId)
    .gte("scheduled_at", nowIso)
    .neq("status", "cancelled")
    .neq("status", "late_cancelled")
    .order("scheduled_at", { ascending: true })
    .limit(5);

  const { data: recent } = await supabase
    .from("sessions")
    .select("id, scheduled_at, session_type, status, completed_at")
    .eq("client_id", clientId)
    .lt("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: false })
    .limit(5);

  // Completed this month (for momentum line)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: completedThisMonth } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "completed")
    .gte("scheduled_at", monthStart.toISOString());

  const { count: completedAllTime } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("status", "completed");

  const hasAnything =
    packages.length > 0 ||
    subscriptions.length > 0 ||
    (upcoming?.length ?? 0) > 0 ||
    (recent?.length ?? 0) > 0;

  return (
    <div className="rounded-2xl border border-divider bg-navy-soft overflow-hidden">
      {/* Header band */}
      <div className="flex items-center justify-between gap-4 border-b border-divider px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-sky-light" />
          <h3 className="font-semibold text-cream">Session Tracker</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-cream-faint">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            {completedThisMonth ?? 0} this month
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {completedAllTime ?? 0} all-time
          </span>
          <Link
            href={`/sessions/new?client_id=${clientId}`}
            className="flex items-center gap-1.5 text-sky-light hover:text-sky-300 transition-colors"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Book
          </Link>
        </div>
      </div>

      {!hasAnything && (
        <div className="px-5 py-10 text-center text-sm text-cream-faint">
          No plans or sessions yet. Book a session or add a package to start
          tracking.
        </div>
      )}

      {/* Package progress */}
      {packages.length > 0 && (
        <div className="px-5 py-4 space-y-3 border-b border-divider">
          {packages.map((p) => {
            const total = p.total_sessions ?? 0;
            const used = p.sessions_used ?? 0;
            const remaining = Math.max(total - used, 0);
            const low = remaining <= 2 && remaining > 0;
            const empty = remaining === 0;
            return (
              <div key={p.id} className="flex items-center gap-4">
                <ProgressRing used={used} total={total} low={low || empty} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-cream">
                      {p.custom_label ||
                        TIER_LABEL[p.tier] ||
                        "Session Package"}
                    </span>
                    {low && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
                        <AlertTriangle className="h-3 w-3" />
                        Running low
                      </span>
                    )}
                    {empty && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">
                        <AlertTriangle className="h-3 w-3" />
                        Depleted — time to renew
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-cream-dim">
                    {used} of {total} sessions used
                    {p.expires_at && (
                      <span className="text-cream-faint">
                        {" · expires "}
                        {fmtDate(p.expires_at)}
                      </span>
                    )}
                  </div>
                  {/* Linear bar under the text for quick scan */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        empty || low ? "bg-amber-400" : "bg-sky-400"
                      }`}
                      style={{
                        width: `${total > 0 ? (used / total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div className="px-5 py-4 space-y-2 border-b border-divider">
          {subscriptions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-cream">
                  {s.custom_label || TIER_LABEL[s.tier] || "Membership"}
                </div>
                <div className="text-sm text-cream-dim">
                  {completedThisMonth ?? 0} sessions completed this month
                </div>
              </div>
              {s.monthly_rate_cents != null && (
                <div className="text-right">
                  <div className="font-semibold text-cream">
                    {formatCurrency(s.monthly_rate_cents)}
                  </div>
                  <div className="text-[11px] text-cream-faint">per month</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upcoming + Recent, side by side on wide screens */}
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-divider">
        {/* Upcoming */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-cream-dim" />
            <span className="text-xs font-medium uppercase tracking-wide text-cream-faint">
              Upcoming
            </span>
          </div>
          {(upcoming?.length ?? 0) === 0 ? (
            <p className="text-sm text-cream-faint">
              Nothing booked.{" "}
              <Link
                href={`/sessions/new?client_id=${clientId}`}
                className="text-sky-light hover:underline"
              >
                Schedule one
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming!.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-navy-elev transition-colors"
                  >
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        TYPE_DOT[s.session_type] ?? "bg-sky-400"
                      }`}
                    />
                    <span className="text-sm text-cream flex-1 min-w-0 truncate capitalize">
                      {String(s.session_type).replace("_", " ")}
                    </span>
                    <span className="text-xs text-cream-faint shrink-0">
                      {fmtDate(s.scheduled_at)} · {fmtTime(s.scheduled_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-cream-dim" />
            <span className="text-xs font-medium uppercase tracking-wide text-cream-faint">
              Recent
            </span>
          </div>
          {(recent?.length ?? 0) === 0 ? (
            <p className="text-sm text-cream-faint">No past sessions.</p>
          ) : (
            <ul className="space-y-2">
              {recent!.map((s) => {
                const dimmed =
                  s.status === "no_show" || s.status === "late_cancelled";
                return (
                  <li key={s.id}>
                    <Link
                      href={`/sessions/${s.id}`}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-navy-elev transition-colors ${
                        dimmed ? "opacity-50" : ""
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          TYPE_DOT[s.session_type] ?? "bg-sky-400"
                        }`}
                      />
                      <span className="text-sm text-cream flex-1 min-w-0 truncate capitalize">
                        {String(s.session_type).replace("_", " ")}
                        {s.status === "completed" && (
                          <span className="text-status-optimal"> ✓</span>
                        )}
                        {s.status === "no_show" && (
                          <span className="text-cream-faint">
                            {" "}
                            · no-show
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-cream-faint shrink-0">
                        {fmtDate(s.scheduled_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
