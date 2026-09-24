import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

/** Client-only workout history. RLS and explicit client_id both restrict records. */
export default async function WorkoutHistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/workouts");
  const { data: profile } = await supabase.from("profiles")
    .select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "client") redirect("/dashboard");

  const { data: logs, error } = await supabase.from("workout_logs")
    .select("id, exercise_name, set_number, actual_reps, actual_load_lb, actual_rpe, notes, created_at")
    .eq("client_id", user.id)
    .order("created_at", { ascending: false }).limit(100);

  const byDate = new Map<string, typeof logs>();
  for (const log of logs ?? []) {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric"
    }).format(new Date(log.created_at));
    byDate.set(day, [...(byDate.get(day) ?? []), log]);
  }

  return <AppShell>
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-8">
      <div>
        <Link href="/progress" className="text-sm text-sky-light">← My progress</Link>
        <h1 className="mt-3 text-3xl font-semibold text-cream">Workout history</h1>
        <p className="mt-1 text-sm text-cream-dim">Your recorded sets, loads and effort.</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-divider p-5 text-cream">
        Workout history is unavailable right now. Please try again later.
      </div>}
      {!error && byDate.size === 0 && <div className="rounded-xl border border-divider p-6 text-cream-dim">
        No workouts logged yet. Once you record your sets with your coach, they will appear here.
      </div>}
      {!error && Array.from(byDate).map(([day, entries]) =>
        <section key={day} className="overflow-hidden rounded-xl border border-divider">
          <h2 className="bg-navy-elev px-4 py-3 text-base font-semibold text-cream">{day}</h2>
          <ul className="divide-y divide-divider">
            {(entries ?? []).map(log => <li key={log.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-cream">{log.exercise_name}</span>
                <span className="shrink-0 text-sm text-cream-dim">Set {log.set_number}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-cream-dim">
                {log.actual_reps !== null && <span>{log.actual_reps} reps</span>}
                {log.actual_load_lb !== null && <span>{log.actual_load_lb} lb</span>}
                {log.actual_rpe !== null && <span>RPE {log.actual_rpe}</span>}
              </div>
              {log.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-cream-dim">{log.notes}</p>}
            </li>)}
          </ul>
        </section>
      )}
    </main>
  </AppShell>;
}
