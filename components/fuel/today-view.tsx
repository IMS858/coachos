import Link from "next/link";
import type {ReactNode} from "react";
import {FUEL_TZ} from "@/lib/fuel/model";
import {buildFuelToday, HABIT_LABELS, type FuelTodayData} from "@/lib/fuel/today";
import {CancelSessionButton} from "@/components/sessions/cancel-session-button";

const card = "min-w-0 rounded-2xl border border-divider bg-white p-4 sm:p-5";
const secondary = "inline-flex min-h-11 items-center text-sm font-semibold text-sky";
function Warning({children}: {children: ReactNode}) {
  return <p role="alert" className="rounded-xl border border-status-moderate/30 bg-surface-soft p-3 text-sm leading-6 text-cream-dim">{children}</p>;
}
export function FuelTodayView({data, children}: {data: FuelTodayData; children?: ReactNode}) {
  const today = buildFuelToday(data);
  const dayTitle = today.context.day === "training" ? "Training day" : today.context.day === "rest" ? "Rest day" : "Your day, your plan";
  const when = today.next ? new Date(today.next.scheduled_at).toLocaleString("en-US", {
    timeZone: FUEL_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }) : null;
  const primary = "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-sky px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-sky-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky sm:w-auto";
  return <section aria-label="Today: training and fuel" className="space-y-4">
    <article className="overflow-hidden rounded-3xl border border-sky/20 bg-white">
      <header className="bg-band p-5 text-white sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-white/70">Today · {data.date} · Pacific</p>
        <h2 className="mt-2 text-3xl font-bold">{dayTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-white/80">{today.context.source === "client_reported" ? "Based on the day you reported." : today.context.source === "calendar_planned" ? "Training is on your calendar. This is the planned day, not a completed workout." : today.context.source === "unavailable" ? "Day context could not be fully checked. No rest day was assumed." : "Choose training or rest in your check-in. Independent training counts too."}</p>
      </header>
      <div className="space-y-4 p-5 sm:p-6">
        {data.plan.status === "unavailable" ? <Warning>{data.plan.message}</Warning> : today.released?.kind === "none" ? <p className="text-sm leading-6 text-cream-dim">No Fuel plan has been released yet. Training and optional check-ins remain available; no nutrition targets are assumed.</p> : today.released?.kind === "paused" ? <p className="text-sm leading-6 text-cream-dim">Your Fuel plan is paused. Previous releases remain in your history, but do not control today.</p> : !today.active ? <p className="text-sm leading-6 text-cream-dim">Your released plan has no phase assigned for today. Ask your coach which plan applies; old targets are not reused.</p> : <>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-sky">Coach released · version {today.active.revision}</p><h3 className="mt-1 text-xl font-semibold text-cream">{today.phase?.name}</h3><p className="mt-1 break-words text-sm text-cream-dim">{today.active.content.title}</p>{today.phase?.focus && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-cream-dim">{today.phase.focus}</p>}</div>
          {today.targets ? <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{([
            ["Energy", today.targets.kcal, "kcal"], ["Protein", today.targets.protein_g, "g"],
            ["Carbs", today.targets.carbs_g, "g"], ["Fat", today.targets.fat_g, "g"],
          ] as const).map(([label, value, unit]) => <div key={label} className="min-w-0 rounded-xl bg-surface-soft p-3"><dt className="text-xs font-semibold text-cream-dim">{label}</dt><dd className="mt-1 break-words text-xl font-bold tabular-nums text-cream">{value === null ? <span className="text-sm font-normal">Not assigned</span> : <>{value.toLocaleString("en-US")} <span className="text-xs font-normal">{unit}</span></>}</dd></div>)}</dl> : <p className="text-sm text-cream-dim">{today.active.content.mode === "habits" ? "Habit-led plan. No calorie or macro target is assigned." : "Choose your day type to see the matching coach-approved targets."}</p>}
          {today.guidance && <details className="rounded-xl bg-sky/5 p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky">Coach-approved fuel guidance</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-cream-dim">{today.guidance}</p><p className="mt-3 text-xs text-cream-faint">From this released plan, unchanged. No advice was generated from your workout.</p></details>}
        </>}
        {today.context.conflict && <Warning>You reported a rest day, but training is still on your calendar. Your reported day selects the targets; check your booking or update your report.</Warning>}
        {data.sessions.status === "unavailable" && <Warning>{data.sessions.message}</Warning>}
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-faint">Your next step</p>{today.action.reload ? <a href={today.action.href} className={primary}>{today.action.label} →</a> : <Link href={today.action.href} className={primary}>{today.action.label} →</Link>}</div>
      </div>
    </article>
    <div className="grid gap-4 md:grid-cols-2">
      <article className={card}><h3 className="text-xs font-semibold uppercase tracking-wider text-cream-faint">{today.next?.session_type === "training" ? "Next workout" : "Next session"}</h3>
        {data.nextSession.status === "unavailable" ? <div className="mt-3"><Warning>{data.nextSession.message}</Warning></div> : today.next ? <><p className="mt-2 text-lg font-semibold text-cream">{when}</p><p className="mt-2 text-sm capitalize text-cream-dim">{today.next.session_type.replaceAll("_", " ")} · {today.next.status}</p><p className="mt-1 text-sm text-cream-dim">{today.next.duration_minutes === null ? "Duration not recorded" : `${today.next.duration_minutes} minutes`}</p><details className="mt-3"><summary className={secondary + " cursor-pointer"}>Manage this booking</summary><CancelSessionButton sessionId={today.next.id} scheduledAt={today.next.scheduled_at}/></details></> : <><p className="mt-2 text-sm leading-6 text-cream-dim">No upcoming booked session was found. This does not rule out independent training.</p><Link href="/book" className={secondary}>Request a training time →</Link></>}
      </article>
      <article className={card}><h3 className="text-xs font-semibold uppercase tracking-wider text-cream-faint">Daily scorecard · reported habits</h3>
        {data.daily.status === "unavailable" ? <div className="mt-3"><Warning>{data.daily.message}</Warning></div> : today.earlierPlan ? <p className="mt-3 text-sm leading-6 text-cream-dim">Your report is linked to an earlier plan. It is preserved, not graded against this new release.</p> : !today.active || !today.score?.assigned ? <p className="mt-3 text-sm leading-6 text-cream-dim">No current habit checklist has been assigned. An optional check-in is still available.</p> : <>
          <p className="mt-2 text-2xl font-bold tabular-nums text-cream">{today.score.reported ? `${today.score.met} / ${today.score.reported}` : "Not reported yet"}</p><p className="mt-1 text-sm text-cream-dim">{today.score.reported ? "Reported habits marked met" : "Missing reports are not failures."}</p>
          <p className="mt-2 text-xs leading-5 text-cream-faint">{today.score.assigned} assigned · {today.score.unreported} unreported · {today.score.notDue} marked not due. This is not a health score.</p>
          <p className="mt-3 text-xs leading-5 text-cream-dim">{today.habits.map(habit => HABIT_LABELS[habit]).join(" · ")}</p>
        </>}
        {children}
      </article>
    </div>
    <article className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-cream">Your coach check-in</h3><Link href="/fuel#fuel-checkins" className={secondary}>Open conversation →</Link></div>
      {data.checkin.status === "unavailable" ? <Warning>{data.checkin.message}</Warning> : today.checkin ? <><p className="text-xs text-cream-faint">{today.checkin.entry.entry_date} · {today.checkin.response ? "Coach responded" : "Awaiting coach review"}</p>{today.checkin.response && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-cream-dim">{today.checkin.response.note}</p>}</> : <p className="text-sm text-cream-dim">No check-in reported in the last 28 days. Share an update when you are ready.</p>}
      {today.reviewDue && <p className="mt-3 text-xs text-cream-faint">Your plan lists a coach review date of {today.active?.content.review_on}. An update can help that conversation; your plan does not change automatically.</p>}
    </article>
  </section>;
}
