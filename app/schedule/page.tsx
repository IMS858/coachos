import {ScheduleDayGrid} from "@/components/schedule/day-grid";
import {calendarDate,wallMinutes,type CalendarEvent} from "@/lib/schedule/booking-context";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Repeat2, ListChecks, GraduationCap, Clock3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PendingRequests } from "@/components/schedule/pending-requests";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { activeTrainingPackageBalance, packageBalanceLabel } from "@/lib/plans/package-balance";

// Always fetch live data so newly-created records appear immediately.
export const dynamic = "force-dynamic";


/**
 * /schedule — multi-trainer day view with a week strip.
 *
 * Columns = every profile with role owner/trainer (Jason / Gabriel).
 * Rows = 4:30 AM – 7:00 PM, Pacific time.
 * Training blocks click through to session detail.
 * ?date=YYYY-MM-DD selects the day; arrows move a week at a time.
 */

const TZ = "America/Los_Angeles";
// Coach OS scheduling is training-only; use one clear training treatment on the grid.
const TRAINING_STYLE = "bg-sky/10 border-l-[3px] border-l-sky text-sky-deep";

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
  searchParams: Promise<{ date?: string; trainer?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await supabase
    .from("profiles")
    .select("role,deleted_at")
    .eq("id", user.id)
    .single();
  if (!viewer || viewer.deleted_at || !["owner","trainer"].includes(viewer.role)) redirect("/dashboard");

  const params = await searchParams;
  const today = todayInPt();
  const selected = calendarDate(params.date)
    ? (params.date as string)
    : today;

  const monday = mondayOf(selected);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Coach OS self-booking is training-only. Keep the staff calendar focused on training.

  // Trainers = staff profiles (owner coaches too)
  const { data: staff, error: staffError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["owner", "trainer"]).is("deleted_at",null)
    .order("role", { ascending: false }) // owner first
    .order("full_name");
  if(staffError)throw Error("Staff calendars unavailable.");
  const trainers = staff ?? [];
  const requestedTrainer = params.trainer ?? "";
  const selectedTrainerId = requestedTrainer === "all"
    ? "all"
    : trainers.some((t) => t.id === requestedTrainer)
      ? requestedTrainer
      : viewer.role === "trainer" && trainers.some((t) => t.id === user.id)
        ? user.id
        : "all";
  const visibleTrainers = selectedTrainerId === "all" ? trainers : trainers.filter((t) => t.id === selectedTrainerId);
  const trainerQS = `&trainer=${selectedTrainerId}`;
  const isSingleTrainer = selectedTrainerId !== "all";

  // Fetch the whole visible week of sessions (powers day-strip counts too)
  const weekStart = `${monday}T00:00:00${ptOffset(monday)}`;
  const afterWeek = addDays(monday, 7);
  const weekEnd = `${afterWeek}T00:00:00${ptOffset(afterWeek)}`;

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select(
      "id, client_id, trainer_id, scheduled_at, duration_minutes, session_type, status, recurring_series_id"
    )
    .gte("scheduled_at", weekStart)
    .lt("scheduled_at", weekEnd)
    .neq("status", "cancelled")
    .order("scheduled_at");
  if(sessionsError)throw Error("Schedule unavailable; no empty calendar was inferred.");
  const weekSessions = sessions ?? [];
  const { data: classRows, error: classError } = await supabase.from("class_occurrences").select("id,template_id,trainer_id,starts_at,ends_at,capacity,status,class_templates(name,category)").gte("starts_at",weekStart).lt("starts_at",weekEnd).neq("status","cancelled").order("starts_at");
  if(classError) throw new Error("Class schedule could not be loaded.");
  const weekClasses=classRows??[],scopedClasses=selectedTrainerId==="all"?weekClasses:weekClasses.filter((row:any)=>row.trainer_id===selectedTrainerId),dayClasses=scopedClasses.filter((row:any)=>ptDateOf(row.starts_at)===selected);

  // Resolve client names in one extra query (no join ambiguity)
  const clientIds = Array.from(new Set(weekSessions.map((s) => s.client_id)));
  let clientNames: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: names, error: namesError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", clientIds);
    if(namesError)throw Error("Client names unavailable.");
    clientNames = Object.fromEntries(
      (names ?? []).map((n) => [n.id, n.full_name])
    );
  }
  const { data: weekPlans, error: weekPlansError } = clientIds.length
    ? await supabase.from("plans")
        .select("id,client_id,kind,tier,custom_label,service_type,total_sessions,sessions_used,current_session_number,status")
        .in("client_id", clientIds)
        .eq("status", "active")
    : { data: [] as any[], error: null };
  const packageEvidenceByClient = new Map<string, ReturnType<typeof activeTrainingPackageBalance>>();
  if (!weekPlansError) {
    for (const clientId of clientIds) {
      packageEvidenceByClient.set(
        clientId,
        activeTrainingPackageBalance((weekPlans ?? []).filter((plan: any) => plan.client_id === clientId))
      );
    }
  }

  const trainingWeekSessions = weekSessions.filter((s) => s.session_type === "training");
  const scopedWeekSessions = selectedTrainerId === "all" ? trainingWeekSessions : trainingWeekSessions.filter((s) => s.trainer_id === selectedTrainerId);
  const dayCounts: Record<string, number> = {};
  for (const s of scopedWeekSessions) {
    const d = ptDateOf(s.scheduled_at);
    dayCounts[d] = (dayCounts[d] ?? 0) + 1;
  }

  const daySessions = scopedWeekSessions.filter((s) => ptDateOf(s.scheduled_at) === selected);
  const completedToday = daySessions.filter((s) => s.status === "completed").length;
  const remainingToday = daySessions.filter((s) => ["scheduled","confirmed"].includes(s.status)).length;

  const selectedTitle = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${selected}T00:00:00Z`));

  // Pending client session requests (any date)
  const { data: requestRows } = await supabase
    .from("sessions")
    .select("id, scheduled_at, session_type, notes_pre, client_id, trainer_id")
    .eq("status", "requested")
    .order("scheduled_at")
    .limit(20);
  const requestClientIds = [...new Set((requestRows ?? []).map((r: any) => r.client_id))];
  const { data: requestProfiles } = requestClientIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", requestClientIds)
    : { data: [] as any[] };
  const nameById = new Map((requestProfiles ?? []).map((p: any) => [p.id, p.full_name]));
  const requestPlanIds = [...new Set((requestRows ?? []).map((r:any)=>r.client_id))];
  const { data: requestPlans } = requestPlanIds.length ? await supabase.from("plans").select("id,client_id,tier,custom_label,service_type,total_sessions,sessions_used,current_session_number,kind,status").in("client_id",requestPlanIds).eq("status","active") : { data: [] as any[] };
  const scopedRequestRows = selectedTrainerId === "all" ? (requestRows ?? []) : (requestRows ?? []).filter((r:any) => r.trainer_id === selectedTrainerId);
  const pendingRequests = scopedRequestRows.map((r: any) => { const clientPlans=(requestPlans??[]).filter((plan:any)=>plan.client_id===r.client_id); const evidence=activeTrainingPackageBalance(clientPlans); const plan=clientPlans.find((candidate:any)=>candidate.id===evidence.planId); return ({
    id: r.id,
    scheduled_at: r.scheduled_at,
    session_type: r.session_type,
    notes_pre: r.notes_pre,
    client_name: nameById.get(r.client_id) ?? "Client",
    package_label: evidence.status==="none" ? null : plan?.custom_label || plan?.tier?.replaceAll("_"," ") || packageBalanceLabel(evidence),
    sessions_remaining: evidence.status==="known" ? evidence.remaining : null,
  }); });

  const blockQuery=await supabase.from("trainer_time_blocks").select("id,trainer_id,starts_at,ends_at").lt("starts_at",weekEnd).gt("ends_at",weekStart);
  if(blockQuery.error)throw Error("Trainer time blocks unavailable; availability was not inferred.");
  const allDaySessions=weekSessions.filter(s=>ptDateOf(s.scheduled_at)===selected && visibleTrainers.some(t=>t.id===s.trainer_id));
  const calendarEvents:CalendarEvent[]=[
    ...allDaySessions.map(s=>({id:s.id,trainerId:s.trainer_id!,startsAt:s.scheduled_at,endsAt:new Date(Date.parse(s.scheduled_at)+(s.duration_minutes??60)*60000).toISOString(),label:clientNames[s.client_id]??"Client name unavailable",detail:[s.session_type.replaceAll("_"," "),s.status.replaceAll("_"," "),weekPlansError?"Package unavailable":packageEvidenceByClient.has(s.client_id)?packageBalanceLabel(packageEvidenceByClient.get(s.client_id)!):""].filter(Boolean).join(" · "),href:`/sessions/${s.id}`,kind:"session" as const,muted:["late_cancelled","no_show"].includes(s.status),recurring:Boolean(s.recurring_series_id)})),
    ...dayClasses.map((row:any)=>({id:row.id,trainerId:row.trainer_id,startsAt:row.starts_at,endsAt:row.ends_at,label:row.class_templates?.name??"Class",detail:"Group class",href:"/classes/manage",kind:"class" as const})),
    ...(blockQuery.data??[]).filter(b=>ptDateOf(b.starts_at)<=selected&&(ptDateOf(b.ends_at)>selected||ptDateOf(b.ends_at)===selected&&wallMinutes(b.ends_at)>0)).map(b=>({id:b.id,trainerId:b.trainer_id,startsAt:b.starts_at,endsAt:b.ends_at,label:"Unavailable",detail:"Trainer time block",href:null,kind:"block" as const})),
  ];

  return (
    <AppShell>
      <div className="flex min-w-0 flex-col gap-5">
        {pendingRequests.length > 0 && <PendingRequests requests={pendingRequests} />}

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="eyebrow">{isSingleTrainer ? "Coach schedule" : "Team schedule"}</div>
            <h1 className="text-3xl font-bold text-cream">Schedule</h1>
            <p className="text-sm text-cream-dim mt-1">
              {selectedTitle}
              {selected === today && (
                <span className="text-sky-light"> · Today</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/schedule?date=${addDays(selected, -7)}${trainerQS}`}>
              <Button variant="ghost" size="icon" title="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/schedule?date=${today}${trainerQS}`}>
              <Button variant="secondary">
                <CalendarDays className="h-4 w-4" />
                Today
              </Button>
            </Link>
            <Link href={`/schedule?date=${addDays(selected, 7)}${trainerQS}`}>
              <Button variant="ghost" size="icon" title="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/schedule/agenda?date=${selected}${trainerQS}`}><Button variant="secondary"><ListChecks className="h-4 w-4" /> Daily agenda</Button></Link>
            <Link href="/schedule/standing"><Button variant="secondary"><Repeat2 className="h-4 w-4" /> Standing bookings</Button></Link>
            <Link href="/classes/manage"><Button variant="secondary"><GraduationCap className="h-4 w-4"/> Classes</Button></Link>
            <Link href={`/sessions/new?date=${selected}&trainer_id=${isSingleTrainer?selectedTrainerId:user.id}&from=schedule`}>
              <Button>
                <Plus className="h-4 w-4" />
                New training session
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-divider bg-white p-3 shadow-sm"><Link href={`/schedule?date=${selected}&trainer=all`} aria-current={selectedTrainerId === "all" ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold ${selectedTrainerId === "all" ? "bg-sky text-white" : "bg-surface-soft text-cream"}`}>All trainers</Link>{trainers.map((trainer) => <Link key={trainer.id} href={`/schedule?date=${selected}&trainer=${trainer.id}`} aria-current={selectedTrainerId === trainer.id ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${selectedTrainerId === trainer.id ? "bg-sky text-white" : "bg-surface-soft text-cream"}`}><Avatar name={trainer.full_name} size="sm"/><span>{trainer.id === user.id ? "My schedule" : trainer.full_name}</span></Link>)}</div>

        {dayClasses.length>0&&<section className="rounded-2xl border border-sky/20 bg-sky/5 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-sky">Group coaching today</p><h2 className="mt-1 font-semibold text-cream">{dayClasses.length} class{dayClasses.length===1?"":"es"} on the selected schedule</h2></div><GraduationCap className="h-5 w-5 text-sky"/></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{dayClasses.map((row:any)=><div key={row.id} className="rounded-xl bg-white p-3"><p className="text-sm font-semibold text-cream">{row.class_templates?.name??"Class"}</p><p className="mt-1 text-xs text-cream-dim">{fmtTime(row.starts_at)} · capacity {row.capacity}</p></div>)}</div></section>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Selected day</p><p className="mt-1 text-2xl font-bold text-cream">{daySessions.length}</p><p className="text-xs text-cream-dim">{remainingToday} upcoming · {completedToday} done</p></div>
          <div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Week</p><p className="mt-1 text-2xl font-bold text-cream">{scopedWeekSessions.length}</p><p className="text-xs text-cream-dim">training sessions</p></div>
          <div className="rounded-2xl border border-divider bg-white p-4"><p className="text-xs uppercase tracking-wider text-cream-faint">Requests</p><p className="mt-1 text-2xl font-bold text-cream">{pendingRequests.length}</p><p className="text-xs text-cream-dim">need review</p></div>
          <Link href="/schedule/standing" className="rounded-2xl border border-sky/20 bg-sky/5 p-4 transition hover:border-sky/50"><p className="text-xs uppercase tracking-wider text-sky">Recurring</p><p className="mt-1 text-sm font-semibold text-cream">Manage standing slots →</p></Link>
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
                href={`/schedule?date=${d}${trainerQS}`}
                className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                  isSelected
                    ? "border-sky bg-sky shadow-sm"
                    : isToday
                      ? "border-sky/50 bg-sky/10 hover:bg-sky/15"
                      : "border-divider bg-navy-soft hover:bg-navy-elev"
                }`}
              >
                <div
                  className={`text-[11px] uppercase tracking-wide ${
                    isSelected ? "text-white/75" : isToday ? "text-sky" : "text-cream-faint"
                  }`}
                >
                  {dayName}
                </div>
                <div
                  className={`tabular text-xl font-bold ${
                    isSelected ? "text-white" : isToday ? "text-sky" : "text-cream"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {Number(d.slice(8))}
                </div>
                <div className="flex items-center justify-center gap-0.5 h-4">
                  {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected ? "bg-white/80" : "bg-sky"
                      }`}
                    />
                  ))}
                  {count > 4 && (
                    <span
                      className={`text-[10px] leading-none ml-0.5 ${
                        isSelected ? "text-white/80" : "text-sky"
                      }`}
                    >
                      +{count - 4}
                    </span>
                  )}
                </div>
                <span className="sr-only">
                  {count > 0 ? `${count} session${count === 1 ? "" : "s"}` : "no sessions"}
                </span>
              </Link>
            );
          })}
        </div>

        <ScheduleDayGrid date={selected} trainers={visibleTrainers} events={calendarEvents}/>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider bg-white p-4 text-xs text-cream-dim"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm border ${TRAINING_STYLE}`} />Personal Training</div><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Pacific Time · tap any open slot</div></div>
      </div>
    </AppShell>
  );
}
