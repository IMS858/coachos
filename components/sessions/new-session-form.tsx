"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Search,
  X,
  Clock,
  Package as PackageIcon,
  Repeat,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ActivePlan {
  kind: "subscription" | "package";
  tier: string;
  service_type: string | null;
  custom_label: string | null;
  current_session_number: number | null;
  monthly_rate_cents: number | null;
}

interface Client {
  id: string;
  full_name: string;
  email: string;
  active_plans: ActivePlan[];
}

interface Trainer {
  id: string;
  full_name: string;
}

interface Props {
  initialMode: "schedule" | "log";
  initialClientId?: string;
  clients: Client[];
  trainers: Trainer[];
  currentUserId: string;
}

const SERVICE_TYPES = [
  { value: "training", label: "Training", billable: true },
  { value: "massage", label: "Massage", billable: true },
  { value: "pilates", label: "Pilates", billable: true },
  { value: "recovery", label: "Recovery", billable: false },
  { value: "assessment", label: "Assessment", billable: false },
] as const;

export function NewSessionForm({
  initialMode,
  initialClientId,
  clients,
  trainers,
  currentUserId,
}: Props) {
  const router = useRouter();

  const [mode, setMode] = useState<"schedule" | "log">(initialMode);
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [trainerId, setTrainerId] = useState(currentUserId);
  const [scheduledAt, setScheduledAt] = useState(() =>
    initialMode === "log" ? defaultLogTime() : defaultScheduleTime()
  );
  const [duration, setDuration] = useState(60);
  const [serviceType, setServiceType] = useState<
    "training" | "massage" | "pilates" | "recovery" | "assessment"
  >("training");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClient = clients.find((c) => c.id === clientId);

  // Which package will this session bill against (log mode only)?
  const targetPackage = useMemo(() => {
    if (mode !== "log") return null;
    if (!selectedClient) return null;
    if (!["training", "massage", "pilates"].includes(serviceType)) return null;
    return (
      selectedClient.active_plans.find(
        (p) => p.kind === "package" && p.service_type === serviceType
      ) ?? null
    );
  }, [mode, selectedClient, serviceType]);

  // Re-default the time when mode toggles
  function switchMode(next: "schedule" | "log") {
    setMode(next);
    setScheduledAt(next === "log" ? defaultLogTime() : defaultScheduleTime());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Pick a client first.");
      return;
    }
    if (!scheduledAt) {
      setError("Pick a date and time.");
      return;
    }
    if (duration < 1) {
      setError("Duration must be at least 1 minute.");
      return;
    }

    setSubmitting(true);

    const isPackageBilled = ["training", "massage", "pilates"].includes(serviceType);

    const payload = {
      mode,
      client_id: clientId,
      trainer_id: trainerId,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_minutes: duration,
      session_type: serviceType,
      service_type: isPackageBilled ? serviceType : null,
      notes_pre: mode === "schedule" ? notes || null : null,
      notes_post: mode === "log" ? notes || null : null,
    };

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const result = await res.json();
      router.push(`/sessions/${result.session_id}`);
      router.refresh();
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Could not save session.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Mode toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-2">
            <ModeButton
              active={mode === "schedule"}
              onClick={() => switchMode("schedule")}
              icon={<Calendar className="h-4 w-4" />}
              title="Schedule"
              subtitle="Future booking — counter ticks at completion"
            />
            <ModeButton
              active={mode === "log"}
              onClick={() => switchMode("log")}
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Log Completed"
              subtitle="Already done — counter ticks now"
            />
          </div>
        </CardContent>
      </Card>

      {/* Client */}
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
          <CardDescription>
            {selectedClient
              ? "Click change to pick someone else."
              : "Search by name or email."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedClient ? (
            <SelectedClient
              client={selectedClient}
              onChange={() => setClientId("")}
              showPlansHint={mode === "log"}
            />
          ) : (
            <ClientSearch clients={clients} onSelect={setClientId} />
          )}
        </CardContent>
      </Card>

      {/* Session details */}
      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Service type */}
          <div>
            <Label>Service type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {SERVICE_TYPES.map((st) => {
                const hasPackage =
                  st.billable &&
                  selectedClient?.active_plans.some(
                    (p) => p.kind === "package" && p.service_type === st.value
                  );
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setServiceType(st.value as any)}
                    className={`rounded-md border p-2.5 text-sm font-medium transition-colors ${
                      serviceType === st.value
                        ? "border-sky bg-sky/10 text-cream"
                        : "border-divider text-cream-dim hover:border-cream-faint"
                    }`}
                  >
                    <div>{st.label}</div>
                    <div className="text-xs text-cream-faint mt-0.5 font-normal">
                      {!st.billable
                        ? "no charge"
                        : hasPackage
                        ? "✓ has pack"
                        : "no pack"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Counter preview when logging */}
            {mode === "log" && selectedClient && (
              <CounterPreview
                serviceType={serviceType}
                targetPackage={targetPackage}
                clientName={selectedClient.full_name}
              />
            )}
          </div>

          {/* Date / time / duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>{mode === "log" ? "When did it happen?" : "When?"}</Label>
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full h-10 rounded-md border border-divider bg-navy-deep px-3 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-sky"
              />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number.parseInt(e.target.value) || 60)}
              />
            </div>
          </div>

          {/* Trainer */}
          <div>
            <Label>Trainer</Label>
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="w-full h-10 rounded-md border border-divider bg-navy-deep px-3 text-sm text-cream focus:outline-none focus:ring-2 focus:ring-sky"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                  {t.id === currentUserId ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label>
              {mode === "log" ? "Post-session note" : "Pre-session note"}{" "}
              <span className="text-cream-faint normal-case">(optional)</span>
            </Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={mode === "log" ? 4 : 3}
              placeholder={
                mode === "log"
                  ? "What was done? RPE, load, tweaks, what to revisit next time."
                  : "Anything to prep — focus area, recent issue, mood check."
              }
              className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-4 py-3 text-sm text-status-limited flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting || !clientId}
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : mode === "log" ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Log + tick counter
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Schedule session
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/* ============================================================================
   CLIENT SEARCH — searchable dropdown
   ============================================================================ */

function ClientSearch({
  clients,
  onSelect,
}: {
  clients: Client[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return clients.slice(0, 30);
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [clients, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[highlightIndex];
      if (c) onSelect(c.id);
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-faint pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a name…"
          autoFocus
          className="w-full h-10 rounded-md border border-divider bg-navy-deep pl-9 pr-3 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky"
        />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-divider bg-navy-deep">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-cream-faint italic">
            No clients match "{query}"
          </div>
        )}
        {filtered.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            onMouseEnter={() => setHighlightIndex(idx)}
            className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-3 ${
              highlightIndex === idx
                ? "bg-sky/15 text-cream"
                : "text-cream-dim hover:bg-navy-elev"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium text-cream truncate">{c.full_name}</div>
              <div className="text-xs text-cream-faint truncate">{c.email}</div>
            </div>
            <PlanSummary plans={c.active_plans} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   SELECTED CLIENT — shown after picking; lists active plans
   ============================================================================ */

function SelectedClient({
  client,
  onChange,
  showPlansHint,
}: {
  client: Client;
  onChange: () => void;
  showPlansHint: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-cream">{client.full_name}</div>
          <div className="text-xs text-cream-faint mt-0.5">{client.email}</div>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="inline-flex items-center gap-1 text-xs text-cream-dim hover:text-cream"
        >
          <X className="h-3 w-3" />
          Change
        </button>
      </div>

      {client.active_plans.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wider text-cream-faint">
            Active plans
          </div>
          {client.active_plans.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                {p.kind === "subscription" ? (
                  <Repeat className="h-3 w-3 text-cream-faint" />
                ) : (
                  <PackageIcon className="h-3 w-3 text-cream-faint" />
                )}
                <span className="text-cream">{planLabel(p)}</span>
              </div>
              {p.kind === "package" && p.current_session_number !== null && (
                <span className="text-xs text-cream-faint">
                  #{p.current_session_number}
                </span>
              )}
              {p.kind === "subscription" && p.monthly_rate_cents && (
                <span className="text-xs text-cream-faint">
                  ${(p.monthly_rate_cents / 100).toLocaleString()}/mo
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-status-moderate/30 bg-status-moderate/5 px-3 py-2 text-xs text-cream-dim">
          No active plans.{" "}
          {showPlansHint
            ? "You can still log this session — it'll be flagged for billing review."
            : "Set up billing in their profile first."}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   PLAN SUMMARY — compact badge for the dropdown row
   ============================================================================ */

function PlanSummary({ plans }: { plans: ActivePlan[] }) {
  if (plans.length === 0) {
    return <span className="text-xs text-cream-faint italic">no plans</span>;
  }
  const subs = plans.filter((p) => p.kind === "subscription").length;
  const packs = plans.filter((p) => p.kind === "package").length;
  return (
    <div className="flex items-center gap-1 shrink-0 text-xs text-cream-faint">
      {subs > 0 && <span>{subs} sub</span>}
      {subs > 0 && packs > 0 && <span>·</span>}
      {packs > 0 && <span>{packs} pack{packs === 1 ? "" : "s"}</span>}
    </div>
  );
}

/* ============================================================================
   COUNTER PREVIEW — "Will tick Nikki's training counter from #24 → #25"
   ============================================================================ */

function CounterPreview({
  serviceType,
  targetPackage,
  clientName,
}: {
  serviceType: string;
  targetPackage: ActivePlan | null;
  clientName: string;
}) {
  // Non-billable services
  if (!["training", "massage", "pilates"].includes(serviceType)) {
    return (
      <div className="mt-3 rounded-md border border-divider bg-navy-deep px-3 py-2 text-xs text-cream-dim">
        <Clock className="inline h-3 w-3 mr-1" />
        Non-billable session — no counter ticks.
      </div>
    );
  }

  // No package available
  if (!targetPackage) {
    return (
      <div className="mt-3 rounded-md border border-status-moderate/30 bg-status-moderate/5 px-3 py-2 text-xs text-status-moderate flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          {clientName} has no active {serviceType} package. Session will save
          but no counter ticks — flag for a la carte billing.
        </span>
      </div>
    );
  }

  const current = targetPackage.current_session_number ?? 0;
  const next = current + 1;

  return (
    <div className="mt-3 rounded-md border border-status-optimal/30 bg-status-optimal/5 px-3 py-2 text-xs text-status-optimal flex items-center gap-2">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      Will tick {clientName}'s {serviceType} counter from{" "}
      <span className="font-semibold">#{current}</span> →{" "}
      <span className="font-semibold">#{next}</span>
    </div>
  );
}

/* ============================================================================
   HELPERS
   ============================================================================ */

function ModeButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition-colors ${
        active
          ? "border-sky bg-sky/10 text-cream"
          : "border-divider bg-navy-deep text-cream-dim hover:border-cream-faint"
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <div className="text-xs text-cream-faint mt-1">{subtitle}</div>
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
      {children}
    </label>
  );
}

function planLabel(plan: ActivePlan): string {
  if (plan.tier === "custom" && plan.custom_label) return plan.custom_label;
  switch (plan.tier) {
    case "essentials_2x": return "Essentials (2x/wk)";
    case "standard_3x": return "Standard (3x/wk)";
    case "premium_4x": return "Premium (4x/wk)";
    case "recovery_monthly": return "Recovery";
    case "package_6":
    case "package_12":
    case "package_24":
      return `${plan.service_type ?? ""} ${plan.tier.replace("package_", "")}-pack`;
    default: return plan.tier;
  }
}

/**
 * Format date for datetime-local input (the browser expects local time, no Z).
 */
function toLocalDateTimeInput(d: Date): string {
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function defaultLogTime(): string {
  // 1 hour ago, rounded to the hour — assume session just ended
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() - 1);
  return toLocalDateTimeInput(d);
}

function defaultScheduleTime(): string {
  // Next round hour from now
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalDateTimeInput(d);
}
