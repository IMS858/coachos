import {createClient} from "@/lib/supabase/server";
import {loadFuelToday} from "@/lib/fuel/today-load";
import {buildFuelToday} from "@/lib/fuel/today";
import {confirmedTrainingContext} from "@/lib/fuel/model";
import {FuelDailyForm} from "./journal-forms";
import {FuelTodayView} from "./today-view";

export async function FuelTodayCard() {
  const db = await createClient();
  const {data: {user}, error} = await db.auth.getUser();
  if (error) return <p role="alert">Today authorization is unavailable. Refresh to try again.</p>;
  if (!user) return null;
  const me = await db.from("profiles").select("role,deleted_at").eq("id", user.id).maybeSingle();
  if (me.error) return <p role="alert">Today authorization is unavailable. Refresh to try again.</p>;
  if (!me.data || me.data.deleted_at || me.data.role !== "client") return null;
  const data = await loadFuelToday(db, user.id);
  const today = buildFuelToday(data);
  // Failed evidence must never become a new revision-zero save form.
  const canReport = data.plan.status === "ready" && data.daily.status === "ready" && data.sessions.status === "ready";
  return <FuelTodayView data={data}>{canReport && <details className="mt-4 border-t border-divider pt-2"><summary className="flex min-h-12 cursor-pointer items-center text-sm font-semibold text-sky">{today.daily ? "Update my daily check-in" : "Quick daily check-in"}</summary><FuelDailyForm
    key={`${data.date}:${today.daily?.revision ?? 0}:${today.version?.id ?? "none"}`}
    clientId={user.id} date={data.date} entry={today.daily} versionId={today.version?.id ?? null}
    plan={today.active?.content ?? null}
    hasBooking={data.sessions.status === "ready" && confirmedTrainingContext(data.sessions.value, data.date)}
  /></details>}</FuelTodayView>;
}
