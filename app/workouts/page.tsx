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
  const { data: coached, error: coachedError } = await supabase.from("session_exercise_performance")
    .select("id,exercise_name,sets_completed,reps_completed,load_performed,rpe_actual,coach_note,created_at")
    .eq("client_id",user.id).order("created_at",{ascending:false}).limit(100);

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
        <div className="mt-4 rounded-2xl bg-band p-6 text-white shadow-lg"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Your training record</p><h1 className="mt-2 text-4xl font-bold text-white">Workout history</h1><p className="mt-2 text-sm text-white/75">Track your consistency, loads and effort over time.</p></div>

      </div>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Recorded sets</p><p className="mt-2 text-3xl font-bold tabular text-cream">{logs?.length ?? 0}</p></div><div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Training days</p><p className="mt-2 text-3xl font-bold tabular text-cream">{byDate.size}</p></div></div>
      {!coachedError && (coached?.length??0)>0 && <section className="rounded-2xl border border-sky/20 bg-sky/5 p-5"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-sky">Coached sessions</p><h2 className="mt-1 text-lg font-semibold text-cream">What you actually performed with your coach</h2><p className="mt-1 text-sm leading-6 text-cream-dim">A separate record of performed dosage from coached sessions. Your original program prescription stays intact.</p><div className="mt-4 divide-y divide-divider">{coached!.slice(0,20).map(row=><div key={row.id} className="py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-cream">{row.exercise_name}</p><time className="text-[11px] text-cream-faint">{new Date(row.created_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"})}</time></div><p className="mt-1 text-xs text-cream-dim">{[row.sets_completed!=null?`${row.sets_completed} sets`:"",row.reps_completed,row.load_performed,row.rpe_actual!=null?`RPE ${row.rpe_actual}`:""].filter(Boolean).join(" · ")||"Coach recorded completion"}</p>{row.coach_note&&<p className="mt-1 text-xs text-cream-faint">{row.coach_note}</p>}</div>)}</div></section>}
      {error && <div role="alert" className="rounded-xl border border-divider p-5 text-cream">
        Workout history is unavailable right now. Please try again later.
      </div>}
      {!error && byDate.size === 0 && <div className="rounded-xl border border-divider p-6 text-cream-dim">
        No workouts logged yet. Once you record your sets with your coach, they will appear here.
      </div>}
      {!error && Array.from(byDate).map(([day, entries]) =>
        <section key={day} className="overflow-hidden rounded-2xl border border-divider bg-white shadow-sm">
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
