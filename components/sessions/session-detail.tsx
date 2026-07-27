"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  User as UserIcon,
  AlertCircle,
  Loader2,
  Save,
  RotateCcw,
  Package as PackageIcon,
  Repeat,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SessionData {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  session_type: string;
  service_type: string | null;
  status: string;
  notes_pre: string | null;
  notes_post: string | null;
  completed_at: string | null;
  plan_id: string | null;
  client_id: string;
  trainer_id: string | null;
  client: { full_name: string; email: string; phone: string | null };
  trainer: { full_name: string } | null;
}

interface ActivePlan {
  id: string;
  kind: "subscription" | "package";
  tier: string;
  service_type: string | null;
  custom_label: string | null;
  current_session_number: number | null;
  total_sessions: number | null;
  status: string;
}

interface SessionDetailProps {
  session: SessionData;
  activePlans: ActivePlan[];
}

export function SessionDetail({ session, activePlans }: SessionDetailProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [serviceType, setServiceType] = useState<string>(
    session.service_type ?? "training"
  );
  const [notesPre, setNotesPre] = useState(session.notes_pre ?? "");
  const [notesPost, setNotesPost] = useState(session.notes_post ?? "");
  const [completing, setCompleting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = session.status === "completed";
  const isAssessment = session.session_type === "assessment";
  const isCancelled =
    session.status === "cancelled" || session.status === "late_cancelled";

  // Find the package that would be drained if this is completed against `serviceType`
  const targetPackage = activePlans.find(
    (p) => p.kind === "package" && p.service_type === serviceType
  );

  async function saveNotes() {
    setSavingNotes(true);
    setMessage(null);
    setError(null);
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes_pre: notesPre, notes_post: notesPost }),
    });
    setSavingNotes(false);
    if (res.ok) {
      setMessage("Notes saved.");
      startTransition(() => router.refresh());
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Save failed");
    }
  }

  async function complete() {
    setCompleting(true);
    setError(null);
    setMessage(null);

    // Save notes first if there are unsaved changes
    if (notesPre !== (session.notes_pre ?? "") || notesPost !== (session.notes_post ?? "")) {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes_pre: notesPre, notes_post: notesPost }),
      });
    }

    const res = await fetch(`/api/sessions/${session.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_type: isAssessment ? null : serviceType,
      }),
    });
    setCompleting(false);

    if (res.ok) {
      const result = await res.json();
      if (result.counter) {
        if (result.counter.incremented) {
          setMessage(
            `Session #${result.counter.session_number} for ${session.client.full_name}.`
          );
        } else {
          setMessage(
            `Marked complete. ⚠️  No active ${serviceType} package — flag for billing.`
          );
        }
      } else {
        setMessage("Session marked complete.");
      }
      startTransition(() => router.refresh());
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Complete failed");
    }
  }

  async function uncomplete() {
    if (!confirm("Undo this completion? The session counter will roll back.")) return;
    setCompleting(true);
    setError(null);
    const res = await fetch(`/api/sessions/${session.id}/complete`, {
      method: "DELETE",
    });
    setCompleting(false);
    if (res.ok) {
      setMessage("Reverted.");
      startTransition(() => router.refresh());
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Uncomplete failed");
    }
  }

  const sessionTime = new Date(session.scheduled_at);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {session.client.full_name}
            </h1>
            <StatusBadge status={session.status} />
          </div>
          <div className="flex items-center gap-4 text-sm text-cream-dim mt-2">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {sessionTime.toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {sessionTime.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="h-4 w-4" />
              {session.trainer?.full_name ?? "Unassigned"}
            </span>
            <span>{session.duration_minutes} min</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Service type picker (only if not assessment) */}
          {!isAssessment && !isCompleted && (
            <Card>
              <CardHeader>
                <CardTitle>Service type</CardTitle>
                <CardDescription>
                  Determines which plan this session bills against
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {(["training", "massage", "pilates"] as const).map((type) => {
                    const hasPackage = activePlans.some(
                      (p) => p.kind === "package" && p.service_type === type
                    );
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setServiceType(type)}
                        className={`rounded-md border p-3 text-sm font-medium transition-colors ${
                          serviceType === type
                            ? "border-sky bg-sky/10 text-cream"
                            : "border-divider text-cream-dim hover:border-cream-faint"
                        }`}
                      >
                        <div className="capitalize">{type}</div>
                        <div className="text-xs text-cream-faint mt-1">
                          {hasPackage ? "✓ has package" : "no package"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Session Notes</CardTitle>
              <CardDescription>
                Pre-session prep and post-session debrief
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Pre-session note</Label>
                <textarea
                  value={notesPre}
                  onChange={(e) => setNotesPre(e.target.value)}
                  rows={3}
                  placeholder="What does this client need today? Anything carried over from last session?"
                  disabled={isCompleted}
                  className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-none disabled:opacity-60"
                />
              </div>

              <div>
                <Label>Post-session note</Label>
                <textarea
                  value={notesPost}
                  onChange={(e) => setNotesPost(e.target.value)}
                  rows={4}
                  placeholder="What was actually done? RPE, load, tweaks, what to revisit next time."
                  className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-none"
                />
              </div>

              <div className="flex justify-end pt-2 border-t border-divider">
                <Button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  variant="secondary"
                  size="sm"
                >
                  {savingNotes ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save notes
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Action: Complete or Undo */}
          <Card>
            <CardContent className="pt-6">
              {error && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              {message && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-status-optimal/30 bg-status-optimal/10 px-3 py-2 text-sm text-status-optimal">
                  <CheckCircle2 className="h-4 w-4" />
                  {message}
                </div>
              )}

              {!isCompleted && !isCancelled && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={complete}
                    disabled={completing}
                    size="lg"
                    className="flex-1"
                  >
                    {completing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5" />
                        Mark session complete
                      </>
                    )}
                  </Button>
                </div>
              )}

              {isCompleted && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-status-optimal">
                    <CheckCircle2 className="h-5 w-5" />
                    Completed{" "}
                    {session.completed_at
                      ? new Date(session.completed_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                  </div>
                  <Button
                    onClick={uncomplete}
                    disabled={completing}
                    variant="ghost"
                    size="sm"
                  >
                    {completing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        Undo completion
                      </>
                    )}
                  </Button>
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 text-sm text-cream-faint">
                  <XCircle className="h-5 w-5" />
                  Session was {session.status.replace("_", " ")}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side rail — Active plans */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active plans</CardTitle>
              <CardDescription>
                {activePlans.length === 0
                  ? "No active plans"
                  : "Counter ticks based on service type above"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {activePlans.map((plan) => {
                const isTarget =
                  plan.id === targetPackage?.id && !isAssessment && !isCompleted;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-md border p-3 text-sm transition-colors ${
                      isTarget
                        ? "border-sky bg-sky/10"
                        : plan.id === session.plan_id
                        ? "border-status-optimal/40 bg-status-optimal/5"
                        : "border-divider bg-navy-deep"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {plan.kind === "subscription" ? (
                        <Repeat className="h-3 w-3 text-cream-faint" />
                      ) : (
                        <PackageIcon className="h-3 w-3 text-cream-faint" />
                      )}
                      <span className="font-medium text-cream">
                        {planLabel(plan)}
                      </span>
                    </div>
                    {plan.kind === "package" && (
                      <div className="text-xs text-cream-dim mt-1">
                        Currently at #{plan.current_session_number ?? 0}
                        {isTarget && " — will tick to #" + ((plan.current_session_number ?? 0) + 1)}
                        {plan.id === session.plan_id && " — this session"}
                      </div>
                    )}
                  </div>
                );
              })}
              {activePlans.length === 0 && (
                <p className="text-xs text-cream-faint italic">
                  This client has no active plans. Set up billing in their profile.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <div className="text-xs text-cream-faint">Email</div>
                <div className="text-cream">{session.client.email}</div>
              </div>
              {session.client.phone && (
                <div>
                  <div className="text-xs text-cream-faint">Phone</div>
                  <div className="text-cream">{session.client.phone}</div>
                </div>
              )}
              <a
                href={`/clients/${session.client_id}`}
                className="inline-block text-xs text-sky-light hover:text-sky pt-2"
              >
                View full profile →
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="optimal">Completed</Badge>;
  if (status === "confirmed") return <Badge tone="optimal">Confirmed</Badge>;
  if (status === "scheduled") return <Badge tone="moderate">Scheduled</Badge>;
  if (status === "cancelled") return <Badge tone="limited">Cancelled</Badge>;
  if (status === "late_cancelled") return <Badge tone="limited">Late Cancel</Badge>;
  if (status === "no_show") return <Badge tone="limited">No-show</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function planLabel(plan: ActivePlan): string {
  if (plan.tier === "custom" && plan.custom_label) return plan.custom_label;
  switch (plan.tier) {
    case "essentials_2x": return "Essentials (2x/wk)";
    case "standard_3x": return "Standard (3x/wk)";
    case "premium_4x": return "Premium (4x/wk)";
    case "recovery_monthly": return "Recovery";
    case "package_6": return `${plan.service_type} 6-pack`;
    case "package_12": return `${plan.service_type} 12-pack`;
    case "package_24": return `${plan.service_type} 24-pack`;
    default: return plan.tier;
  }
}
