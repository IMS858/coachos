import { redirect } from "next/navigation";
import Link from "next/link";
import { Dumbbell, Calendar, ChevronRight, FileDown, PlayCircle, History, MessageCircle } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { HomeworkList } from "@/components/media/homework-list";
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
    .select("id, name, weeks, start_date, end_date, status, pdf_client_url")
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

  // Coaching videos sent to this client, newest first.
  const { data: homework } = await supabase
    .from("client_media")
    .select("id, kind, category, title, note, created_at, viewed_at, duration_seconds, poster_path, exercise_id")
    .eq("client_id", user.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  // Existing assignments may predate the safety gate. Never surface an
  // unapproved library demonstration to a client. Reviews are staff-only; the
  // service lookup is restricted to IDs from this user's RLS-scoped assignments.
  // Only eligibility is used; private review records never reach client props.
  const assignedIds = [...new Set((homework ?? []).map(h => h.exercise_id).filter((id): id is string => !!id))];
  const {data: safetyReviews, error: safetyError} = assignedIds.length
    ? await createServiceClient().from("exercise_reviews").select("exercise_id,safety_status").in("exercise_id",assignedIds)
    : {data:[],error:null};
  const approvedIds = new Set((safetyReviews ?? []).filter(r => r.safety_status === "approved").map(r => r.exercise_id));
  const safeHomework = (homework ?? []).filter(h => !h.exercise_id || (!safetyError && approvedIds.has(h.exercise_id)));

  // Sign the posters in one batch so the list renders with real thumbnails
  // rather than fetching each one after mount.
  const homeworkWithPosters = await Promise.all(
    safeHomework.map(async (h: any) => {
      // A library assignment has no upload of its own — its media lives on the
      // exercise record.
      if (h.exercise_id) {
        const { data: ex } = await supabase
          .from("exercises")
          .select("video_url, thumbnail_url, coaching_cues, client_visible")
          .eq("id", h.exercise_id)
          .maybeSingle();
        return {
          ...h,
          poster_url: (ex as any)?.thumbnail_url ?? null,
          external_url: (ex as any)?.client_visible ? (ex as any)?.video_url ?? null : null,
          cues: (ex as any)?.coaching_cues ?? [],
        };
      }
      if (!h.poster_path) return { ...h, poster_url: null };
      const { data: signed } = await supabase.storage
        .from("client-media")
        .createSignedUrl(h.poster_path, 60 * 60);
      return { ...h, poster_url: signed?.signedUrl ?? null };
    })
  );

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

  if (!program && (!upcoming || upcoming.length === 0) && homeworkWithPosters.length === 0) {
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
        <div className="rounded-2xl bg-band px-5 py-7 text-white shadow-lg">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Your training</div>
          <h1 className="mt-2 text-4xl font-bold text-white">My Plan</h1>
          <p className="mt-2 text-sm text-white/75">
            Your current program and what&apos;s coming up.
          </p>
        </div>

        <nav aria-label="My training" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link href="/workouts" className="flex min-h-24 flex-col justify-between rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50"><History className="h-6 w-6 text-sky" /><span className="text-sm font-semibold text-cream">Workout history →</span></Link>
          <Link href="/book" className="flex min-h-24 flex-col justify-between rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50"><Calendar className="h-6 w-6 text-sky" /><span className="text-sm font-semibold text-cream">Book a session →</span></Link>
          <a href="#exercise-videos" className="flex min-h-24 flex-col justify-between rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50"><PlayCircle className="h-6 w-6 text-sky" /><span className="text-sm font-semibold text-cream">Exercise videos · {homeworkWithPosters.length}</span></a>
          <Link href="/progress" className="flex min-h-24 flex-col justify-between rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50"><Dumbbell className="h-6 w-6 text-sky" /><span className="text-sm font-semibold text-cream">My progress →</span></Link>
          <Link href="/messages" className="flex min-h-24 flex-col justify-between rounded-2xl border border-divider bg-white p-4 shadow-sm transition hover:border-sky/50 sm:col-span-1"><MessageCircle className="h-6 w-6 text-sky" /><span className="text-sm font-semibold text-cream">Message coach →</span></Link>
        </nav>

        {homeworkWithPosters.length === 0 && <p id="exercise-videos" className="rounded-xl border border-divider bg-surface p-4 text-sm text-cream-dim">Your coach-approved exercise videos will appear here when assigned.</p>}
        {homeworkWithPosters.length > 0 && (
          <div id="exercise-videos" className="flex flex-col gap-2 scroll-mt-6">
            <div className="flex items-center gap-2"><PlayCircle className="h-5 w-5 text-sky" /><div className="eyebrow">My exercise videos</div></div>
            <p className="prose-ims text-sm text-cream-dim -mt-1 mb-1">
              Watch your coach-approved demonstrations, review your cues and replay them whenever you train.
            </p>
            <HomeworkList items={homeworkWithPosters as never} />
          </div>
        )}


        {program && (
          <Card>
            <CardHeader>
              <CardTitle id="my-workouts" className="flex scroll-mt-6 items-center gap-2">
                <Dumbbell className="h-5 w-5 text-sky" />
                {program.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-5 flex flex-wrap gap-3">
                <Link href={"/programs/" + program.id} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky px-4 py-3 text-sm font-semibold text-white">Open my workouts <ChevronRight className="h-4 w-4" /></Link>
                {program.pdf_client_url && <a href={"/api/programs/" + program.id + "/pdf"} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-divider px-4 py-3 text-sm font-semibold text-cream"><FileDown className="h-4 w-4" />Download my PDF</a>}
              </div>
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
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/programs/${program.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-sky px-4 py-2 text-sm font-semibold text-white">View my program →</Link>
                {program.pdf_client_url && <a href={`/api/programs/${program.id}/pdf`} className="inline-flex min-h-11 items-center rounded-lg border border-divider px-4 py-2 text-sm font-medium text-cream">Download reviewed PDF</a>}
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
