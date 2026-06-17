"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Plus, Trash2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  full_name: string;
  email: string;
}
interface Trainer {
  id: string;
  full_name: string;
}
interface Slot {
  weekday: number;
  time: string;
}

const WEEKDAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

const SERVICE_TYPES = [
  "training",
  "mobility",
  "pilates",
  "recovery",
  "body_comp",
] as const;

export function StandingBookingForm({
  clients,
  trainers,
  currentUserId,
}: {
  clients: Client[];
  trainers: Trainer[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [trainerId, setTrainerId] = useState(currentUserId);
  const [serviceType, setServiceType] =
    useState<(typeof SERVICE_TYPES)[number]>("training");
  const [duration, setDuration] = useState(60);
  const [perWeek, setPerWeek] = useState(2);
  const [slots, setSlots] = useState<Slot[]>([
    { weekday: 2, time: "09:00" },
    { weekday: 4, time: "09:00" },
  ]);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number } | null>(null);

  const selectedClient = clients.find((c) => c.id === clientId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, clients]);

  // Keep the slot list length in sync with sessions-per-week.
  function setCount(n: number) {
    setPerWeek(n);
    setSlots((prev) => {
      const next = [...prev];
      const defaults = [
        { weekday: 2, time: "09:00" },
        { weekday: 4, time: "09:00" },
        { weekday: 1, time: "09:00" },
        { weekday: 3, time: "09:00" },
      ];
      while (next.length < n) next.push(defaults[next.length]);
      return next.slice(0, n);
    });
  }

  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function submit() {
    setError(null);
    if (!clientId) {
      setError("Pick a client first.");
      return;
    }
    // Guard against two slots on the same weekday+time
    const keys = new Set(slots.map((s) => `${s.weekday}-${s.time}`));
    if (keys.size !== slots.length) {
      setError("Two slots are identical — give each a different day or time.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          trainer_id: trainerId,
          session_type: serviceType,
          duration_minutes: duration,
          slots,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSubmitting(false);
      if (!res.ok) {
        setError(data.error || "Could not create standing booking.");
        return;
      }
      setDone({ created: data.created ?? 0 });
    } catch {
      setSubmitting(false);
      setError("Something went wrong. Try again.");
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col items-center text-center gap-3 py-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky/15 text-sky">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-cream">Standing booking created</h3>
          <p className="text-sm text-cream-faint max-w-sm">
            {selectedClient?.full_name} is now booked into {slots.length}{" "}
            weekly {slots.length === 1 ? "slot" : "slots"}. We scheduled{" "}
            {done.created} sessions for the next 8 weeks and will keep the
            calendar filled automatically until you cancel the series.
          </p>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => router.push("/schedule")}>View schedule</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null);
                setClientId("");
                setQuery("");
              }}
            >
              Book another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Client picker */}
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
          <CardDescription>Who is this standing slot for?</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedClient ? (
            <div className="flex items-center justify-between rounded-lg border border-divider bg-navy-deep/40 px-4 py-3">
              <div>
                <div className="font-medium text-cream">{selectedClient.full_name}</div>
                <div className="text-xs text-cream-faint">{selectedClient.email}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setClientId("")}>
                Change
              </Button>
            </div>
          ) : (
            <div>
              <Input
                placeholder="Search by name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <div className="mt-2 flex flex-col gap-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClientId(c.id)}
                    className="text-left rounded-md px-3 py-2 hover:bg-navy-deep/60 transition-colors"
                  >
                    <span className="text-sm text-cream">{c.full_name}</span>
                    <span className="text-xs text-cream-faint ml-2">{c.email}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-cream-faint px-3 py-2">No clients match.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Frequency */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions per week</CardTitle>
          <CardDescription>How many standing slots each week?</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={cn(
                  "rounded-lg border py-3 text-center transition-colors",
                  perWeek === n
                    ? "border-sky bg-sky/10 text-sky"
                    : "border-divider text-cream-faint hover:border-sky/40"
                )}
              >
                <div className="text-lg font-semibold">{n}×</div>
                <div className="text-[11px]">per week</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Slots */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly slots</CardTitle>
          <CardDescription>
            Pick the day and time for each session. These repeat every week.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {slots.map((slot, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-divider bg-navy-deep/30 p-3"
            >
              <span className="text-xs text-cream-faint w-12">#{i + 1}</span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.n}
                    type="button"
                    onClick={() => updateSlot(i, { weekday: d.n })}
                    className={cn(
                      "h-9 w-11 rounded-md text-xs font-medium transition-colors",
                      slot.weekday === d.n
                        ? "bg-sky text-white"
                        : "bg-navy-deep text-cream-faint hover:bg-navy-deep/70"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <input
                type="time"
                value={slot.time}
                onChange={(e) => updateSlot(i, { time: e.target.value })}
                className="h-9 rounded-md border border-divider bg-navy-deep px-2 text-sm text-cream"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-cream-faint">Trainer</span>
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              className="h-10 rounded-md border border-divider bg-navy-deep px-2 text-sm text-cream"
            >
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-cream-faint">Type</span>
            <select
              value={serviceType}
              onChange={(e) =>
                setServiceType(e.target.value as (typeof SERVICE_TYPES)[number])
              }
              className="h-10 rounded-md border border-divider bg-navy-deep px-2 text-sm text-cream capitalize"
            >
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-cream-faint">Duration (min)</span>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="h-10 rounded-md border border-divider bg-navy-deep px-2 text-sm text-cream"
            >
              {[30, 45, 60, 75, 90].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Creating…" : "Create standing booking"}
      </Button>
      <p className="text-xs text-cream-faint -mt-3">
        Fills the calendar 8 weeks ahead and keeps refilling automatically until
        you cancel the series.
      </p>
    </div>
  );
}
