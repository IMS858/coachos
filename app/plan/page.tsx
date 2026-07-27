import { redirect } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Calendar, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComingSoon } from "@/components/dashboard/coming-soon";

export const dynamic = "force-dynamic";

const TZ = "America/Los_Angeles";

/**
 * /plan — the client's current training program + their upcoming sessions.
 * (Replaces the old placeholder.)
 */
export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/plan");

  const { data: program } = await supabase
    .from("programs")
    .select("id, name, weeks, start_date, end_date, status")
    .eq("client_id", user.id)
    .in("status", ["active", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { data: upcoming } = await supabase
    .from("sessions")
    .select("id, scheduled_at, session_type, duration_minutes, status")
    .eq("client_id", user.id)
    .gte("scheduled_at", nowIso)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: true })
    .limit(8);

  function fmt(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  if (!program && (!upcoming || upcoming.length === 0)) {
    return (
      <AppShell>
        <ComingSoon
          title="My Plan"
          description="Your program and upcoming sessions will show here."
          next={[
            "Your coach is building your program",
            "Book your free assessment to get started",
            "Sessions you book will appear here automatically",
          ]}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-cream">My Plan</h1>
          <p className="text-cream-faint text-sm">
            Your current program and what&apos;s coming up.
          </p>
        </div>

        {program && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-sky" />
                {program.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm text-cream-faint">
                <span>{program.weeks}-week program</span>
                {program.start_date && (
                  <span>
                    Started{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(`${program.start_date}T12:00:00Z`))}
                  </span>
                )}
                <span className="capitalize">{program.status}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-sky" />
              Upcoming sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {upcoming && upcoming.length > 0 ? (
              <div className="divide-y divide-divider">
                {upcoming.map((s) => (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-navy-elev transition-colors"
                  >
                    <div>
                      <div className="text-sm text-cream">{fmt(s.scheduled_at)}</div>
                      <div className="text-xs text-cream-faint capitalize">
                        {String(s.session_type).replace("_", " ")} ·{" "}
                        {s.duration_minutes} min
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-cream-faint" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-cream-faint">
                No upcoming sessions booked yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
