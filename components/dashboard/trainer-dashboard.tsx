import {
  Clock,
  MessageCircle,
  ChevronRight,
  Users,
  Plus,
  Calendar,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadStaffUnreadMessages } from "@/lib/messages/actionable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sessionPrepSummary } from "@/lib/coaching/intelligence";
import { isExerciseSet } from "@/lib/exercises/catalog";
import { activeTrainingPackageBalance } from "@/lib/plans/package-balance";

/**
 * Trainer Dashboard — "Today" view.
 *
 * Header buttons:
 *   - Quick Log → /sessions/new?mode=log     (record a session that just happened)
 *   - Schedule  → /sessions/new?mode=schedule (book a future session)
 *   - New Assessment → /assessments
 *
 * Session cards link to /sessions/[id] for the detail/complete flow.
 */
export async function TrainerDashboard({ fullName }: { fullName: string }) {
  const firstName = fullName.split(" ")[0];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const pacificDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const probe = new Date(`${pacificDate}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "longOffset" }).formatToParts(probe).find(part => part.type === "timeZoneName")?.value.replace("GMT", "") || "-08:00";
  const startOfDay = new Date(`${pacificDate}T00:00:00${zone}`);
  const endOfDay = new Date(`${pacificDate}T23:59:59.999${zone}`);

  const [
    { data: todaySessions },
    { data: draftPrograms },
    unreadMessages,
    { data: viewer },
    { data: assignedClients },
    { data: bookingRequests },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        `id, scheduled_at, duration_minutes, session_type, status, notes_pre,
         clients!inner(id, profiles!inner(full_name)),
         programs(name)`
      )
      .eq("trainer_id", user.id)
      .gte("scheduled_at", startOfDay.toISOString())
      .lte("scheduled_at", endOfDay.toISOString())
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("programs")
      .select("id, name, clients!inner(profiles!inner(full_name))")
      .eq("trainer_id", user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(5),
    loadStaffUnreadMessages(supabase),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("clients").select("id,primary_trainer_id").eq("primary_trainer_id", user.id),
    supabase.from("sessions").select("id,client_id,trainer_id").eq("status", "requested").eq("trainer_id", user.id).limit(50),
  ]);

  const assignedClientIds = new Set((assignedClients ?? []).map((row: any) => row.id));
  const scopedUnread = viewer?.role === "owner" ? (unreadMessages ?? []) : (unreadMessages ?? []).filter((msg: any) => assignedClientIds.has(msg.client_id));
  const actionableMessages = scopedUnread.slice(0,5);

  const sessions = todaySessions ?? [];
const classesQ=await supabase.from("class_occurrences").select("id,starts_at,ends_at,capacity,status,class_templates(name,category)").eq("trainer_id",user.id).gte("starts_at",startOfDay.toISOString()).lte("starts_at",endOfDay.toISOString()).neq("status","cancelled").order("starts_at");
  const todayClientIds = [...new Set(sessions.flatMap((row: any) => row.clients?.id ? [row.clients.id as string] : []))];
  const [prepPlansQ, prepAssessQ, prepProgramsQ] = todayClientIds.length ? await Promise.all([
    supabase.from("plans").select("id,client_id,kind,service_type,total_sessions,sessions_used,current_session_number,status").in("client_id",todayClientIds).eq("status","active"),
    supabase.from("assessments").select("client_id,status,assessment_date").in("client_id",todayClientIds).order("assessment_date",{ascending:false}),
    supabase.from("programs").select("client_id,status,data").in("client_id",todayClientIds).order("updated_at",{ascending:false}).limit(500),
  ]) : [{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  const prepUnavailable = [prepPlansQ,prepAssessQ,prepProgramsQ].some(q=>q.error);
  const packageRemaining = new Map<string,number|null>();
  if(!prepUnavailable) for(const clientId of todayClientIds){
    const evidence=activeTrainingPackageBalance((prepPlansQ.data??[]).filter((p:any)=>p.client_id===clientId));
    packageRemaining.set(clientId,evidence.status==="known"?evidence.remaining:null);
  }
  const latestAssessment = new Map<string,string>();
  if(!prepUnavailable) for(const a of prepAssessQ.data??[]) if(a.status==="complete"&&!latestAssessment.has(a.client_id)) latestAssessment.set(a.client_id,a.assessment_date);
  const activeProgramCount = new Map<string,number>();
  if(!prepUnavailable) for(const p of prepProgramsQ.data??[]){if(isExerciseSet(p.data)||!["published","active"].includes(p.status))continue;activeProgramCount.set(p.client_id,(activeProgramCount.get(p.client_id)??0)+1);}
  const completed = sessions.filter((s: any) => s.status === "completed").length;
  const remaining = sessions.length - completed;
  const actionCount = (draftPrograms ?? []).length + scopedUnread.length + (bookingRequests ?? []).length;


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-5 rounded-3xl bg-band px-6 py-7 text-white shadow-lg">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">IMS Coach OS · Training day</p>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Today, {firstName}
          </h1>
          <p className="text-sm text-white/70 mt-2">
            {sessions.length === 0
              ? "No sessions scheduled today."
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${completed} done · ${remaining} to go`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl bg-white/10 p-2">
          <Link href="/sessions/new?mode=log">
            <Button size="md">
              <Plus className="h-4 w-4" />
              Quick Log
            </Button>
          </Link>
          <Link href={"/schedule?date="+pacificDate+"&trainer="+user.id}>
            <Button variant="secondary" size="md">
              <Calendar className="h-4 w-4" />
              Calendar
            </Button>
          </Link>
          <Link href="/sessions/new?mode=schedule">
            <Button variant="secondary" size="md">
              <Plus className="h-4 w-4" />
              Book
            </Button>
          </Link>
          <Link href="/clients">
            <Button variant="secondary" size="md">
              <Users className="h-4 w-4" />
              Clients
            </Button>
          </Link>
          <Link href="/action-center">
            <Button variant="secondary" size="md">
              <ListChecks className="h-4 w-4" />
              Actions{actionCount > 0 ? ` · ${actionCount}` : ""}
            </Button>
          </Link>
        </div>
      </div>

      {(classesQ.data??[]).length>0&&<Card><CardHeader><CardTitle>Group coaching today</CardTitle><CardDescription>Assigned classes are part of today’s coaching workload.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{(classesQ.data??[]).map((row:any)=><Link key={row.id} href={"/classes/manage/"+row.id} className="flex min-h-16 items-center justify-between rounded-xl border border-divider p-3 transition hover:border-sky/50"><div><p className="text-sm font-semibold text-cream">{row.class_templates?.name??"Class"}</p><p className="mt-1 text-xs text-cream-dim">{new Date(row.starts_at).toLocaleTimeString("en-US",{timeZone:"America/Los_Angeles",hour:"numeric",minute:"2-digit"})} · capacity {row.capacity}</p></div><span className="text-xs font-semibold text-sky">Open class →</span></Link>)}</CardContent></Card>}
      {classesQ.error&&<p role="alert" className="rounded-xl border border-status-limited/30 bg-white p-3 text-sm text-status-limited">Assigned class schedule is unavailable. No zero-class state was inferred.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Today&apos;s schedule</CardTitle><CardDescription>Tap a session to coach, log and close it</CardDescription></div><Link href={"/schedule?date="+pacificDate+"&trainer="+user.id} className="text-sm font-semibold text-sky">Open calendar →</Link></div>
          </CardHeader>
          <CardContent className="space-y-2">{prepUnavailable && <p role="alert" className="rounded-xl border border-status-limited/30 bg-status-limited/5 p-3 text-xs text-status-limited">Session prep evidence could not be loaded. Schedule data is still shown, but package/program/assessment context is unavailable.</p>}
            {sessions.length > 0 ? (
              sessions.map((session: any) => {
                const time = new Date(session.scheduled_at).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }
                );
                const isCompleted = session.status === "completed";
                return (
                  <Link
                    key={session.id}
                    href={`/sessions/${session.id}`}
                    className={`block w-full text-left rounded-md border transition-colors p-4 group ${
                      isCompleted
                        ? "border-status-optimal/30 bg-status-optimal/5 hover:bg-status-optimal/10"
                        : "border-divider bg-navy-deep hover:border-sky/60 hover:bg-navy-elev"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center gap-1 w-16 shrink-0">
                        <Clock className="h-3 w-3 text-cream-faint" />
                        <span className="text-sm font-medium text-cream">{time}</span>
                        <span className="text-xs text-cream-faint">
                          {session.duration_minutes}m
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-cream truncate">
                            {session.clients?.profiles?.full_name ?? "—"}
                          </span>
                          <SessionStatusBadge status={session.status} />
                        </div>
                        <div className="text-sm text-cream-dim mt-0.5 truncate">
                          {session.programs?.name ??
                            (session.session_type === "assessment"
                              ? "Movement Assessment"
                              : "Training")}
                        </div>
                        {session.notes_pre && (
                          <div className="text-xs text-cream-faint italic mt-1.5 truncate">
                            Note: {session.notes_pre}
                          </div>
                        )}
                        {!prepUnavailable && session.clients?.id && (() => {
                          const prep=sessionPrepSummary({now:new Date().toISOString(),packageRemaining:packageRemaining.get(session.clients.id)??null,latestAssessmentAt:latestAssessment.get(session.clients.id)??null,activePrograms:activeProgramCount.get(session.clients.id)??0});
                          return prep.length ? <div className="mt-2 flex flex-wrap gap-1.5">{prep.map((item:string)=><span key={item} className="rounded-full bg-white/8 px-2 py-1 text-[11px] text-cream-dim">{item}</span>)}</div> : null;
                        })()}
                      </div>
                      <ChevronRight className="h-4 w-4 text-cream-faint shrink-0 mt-1 group-hover:text-cream-dim" />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="py-12 text-center text-sm text-cream-faint">
                Nothing on the books today.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Action Center</CardTitle><CardDescription>Follow-up work stays separate from today’s coaching schedule.</CardDescription></CardHeader>
            <CardContent><Link href="/action-center" className="flex min-h-11 items-center justify-between rounded-xl border border-divider px-3 text-sm font-semibold text-cream transition hover:border-sky/50"><span>{actionCount} coaching action{actionCount===1?"":"s"}</span><ChevronRight className="h-4 w-4 text-sky"/></Link></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Messages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionableMessages.length > 0 ? (
                actionableMessages.map((msg: any) => (
                  <Link
                    key={msg.id}
                    href={`/messages/${msg.client_id}`}
                    className="flex items-start justify-between gap-2 rounded-xl -mx-2 px-2 py-2 transition hover:bg-navy-elev"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-cream truncate">
                        Client message
                      </div>
                      <div className="text-xs text-cream-faint truncate">
                        {msg.body}
                      </div>
                    </div>
                    <span className="text-xs text-cream-faint shrink-0">
                      {new Date(msg.created_at).toLocaleDateString("en-US",{timeZone:"America/Los_Angeles",month:"short",day:"numeric"})}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-cream-faint italic">
                  No unread messages.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="optimal">Complete</Badge>;
  if (status === "confirmed") return <Badge tone="optimal">Confirmed</Badge>;
  if (status === "scheduled") return <Badge tone="moderate">Scheduled</Badge>;
  if (status === "cancelled") return <Badge tone="limited">Cancelled</Badge>;
  if (status === "no_show") return <Badge tone="limited">No-show</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

