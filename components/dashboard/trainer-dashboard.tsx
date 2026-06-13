import {
  Clock,
  CheckCircle2,
  CircleDot,
  MessageCircle,
  ChevronRight,
  ClipboardList,
  Plus,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [
    { data: todaySessions },
    { data: draftPrograms },
    { data: pendingAssessments },
    { data: unreadMessages },
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
    supabase
      .from("assessments")
      .select("id, clients!inner(profiles!inner(full_name))")
      .eq("trainer_id", user.id)
      .eq("status", "complete")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("messages")
      .select("id, body, created_at, profiles:sender_id!inner(full_name)")
      .is("read_at", null)
      .neq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const sessions = todaySessions ?? [];
  const completed = sessions.filter((s: any) => s.status === "completed").length;
  const remaining = sessions.length - completed;

  const tasks: Array<{ label: string; urgent: boolean; href: string }> = [];
  for (const p of draftPrograms ?? []) {
    const name = (p as any).clients?.profiles?.full_name ?? "client";
    tasks.push({
      label: `Program for ${name} is in draft`,
      urgent: true,
      href: `/programs/${p.id}`,
    });
  }
  for (const a of pendingAssessments ?? []) {
    const name = (a as any).clients?.profiles?.full_name ?? "client";
    tasks.push({
      label: `${name}'s assessment ready for program`,
      urgent: false,
      href: `/assessments/${a.id}`,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Today, {firstName}
          </h1>
          <p className="text-sm text-cream-dim mt-1">
            {sessions.length === 0
              ? "No sessions scheduled today."
              : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${completed} done · ${remaining} to go`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sessions/new?mode=log">
            <Button size="md">
              <Plus className="h-4 w-4" />
              Quick Log
            </Button>
          </Link>
          <Link href="/sessions/new?mode=schedule">
            <Button variant="secondary" size="md">
              <Calendar className="h-4 w-4" />
              Schedule
            </Button>
          </Link>
          <Link href="/assessments">
            <Button variant="secondary" size="md">
              <ClipboardList className="h-4 w-4" />
              Assessment
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Tap a card to log the session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.length > 0 ? (
              sessions.map((session: any) => {
                const time = new Date(session.scheduled_at).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit" }
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
            <CardHeader>
              <CardTitle>Pending Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length > 0 ? (
                tasks.map((task, i) => (
                  <Link
                    key={i}
                    href={task.href}
                    className="flex items-start gap-2 text-sm hover:bg-navy-elev rounded-md -mx-2 px-2 py-1 transition-colors"
                  >
                    {task.urgent ? (
                      <CircleDot className="h-4 w-4 text-status-limited shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-cream-faint shrink-0 mt-0.5" />
                    )}
                    <span className={task.urgent ? "text-cream" : "text-cream-dim"}>
                      {task.label}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-cream-faint italic">
                  Nothing pending. Inbox zero.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Messages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {unreadMessages && unreadMessages.length > 0 ? (
                unreadMessages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-cream truncate">
                        {msg.profiles?.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-cream-faint truncate">
                        {msg.body}
                      </div>
                    </div>
                    <span className="text-xs text-cream-faint shrink-0">
                      {humanAgo(new Date(msg.created_at))}
                    </span>
                  </div>
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

function humanAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
