"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Sessions start on the hour or the half hour — a 6:47 request isn't a slot
 * anyone can actually train in, so the picker shouldn't offer one.
 *
 * Bounds follow studio hours: Mon-Fri 6am-7pm, Sat 8am-1pm, Sun by
 * appointment (handled by messaging Jason rather than self-booking).
 * Last start is one hour before close so a full session fits.
 */
function slotsForDate(dateStr: string): { value: string; label: string }[] {
  if (!dateStr) return [];
  // Parse as local, not UTC — new Date("2026-07-27") is midnight UTC and can
  // land on the previous day, which would pick the wrong opening hours.
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, (m ?? 1) - 1, d ?? 1).getDay();

  if (day === 0) return []; // Sunday — by appointment
  const [openHour, closeHour] = day === 6 ? [8, 13] : [6, 19];

  const out: { value: string; label: string }[] = [];
  for (let h = openHour; h <= closeHour - 1; h++) {
    for (const min of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const display = h % 12 === 0 ? 12 : h % 12;
      const suffix = h < 12 ? "AM" : "PM";
      out.push({
        value,
        label: `${display}:${String(min).padStart(2, "0")} ${suffix}`,
      });
    }
  }
  return out;
}

export function BookingForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [available, setAvailable] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAvailability(nextDate: string) {
    setDate(nextDate); setTime(""); setAvailable(null);
    if (!nextDate) return;
    setLoadingSlots(true); setError(null);
    try { const res=await fetch(`/api/sessions/availability?date=${encodeURIComponent(nextDate)}`, { cache: "no-store" }); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error || "Availability unavailable"); setAvailable(Array.isArray(data.slots)?data.slots:[]); }
    catch(err){ setAvailable(null); setError(err instanceof Error ? err.message : "Availability unavailable"); }
    finally { setLoadingSlots(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_at: new Date(`${date}T${time}`).toISOString(),
          session_type: "training",
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        setDate("");
        setTime("");
        setNote("");
        router.refresh();
        setTimeout(() => setDone(false), 4000);
      } else {
        // Surface the server's detail too — an unrun migration shows up here as a
        // Postgres enum error, which is the difference between "it's broken" and
        // knowing exactly which SQL to run.
        setError(
          [data.error || "Couldn't send the request.", data.detail]
            .filter(Boolean)
            .join(" — ")
        );
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectCls =
    "bg-navy-deep border border-divider rounded-lg px-3 py-2 text-sm text-cream w-full focus:outline-none focus:border-sky";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-sky" /> Request a time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">Date</label>
              <Input
                type="date"
                required
                min={new Date().toISOString().split("T")[0]}
                value={date}
                onChange={(e) => void loadAvailability(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">Time</label>
              <select
                className={selectCls}
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              >
                <option value="">
                  {loadingSlots ? "Checking coach calendar…" : date && slotsForDate(date).length === 0 ? "Sundays are by appointment — message Jason" : available?.length === 0 ? "No open times — choose another day" : "Choose an available time…"}
                </option>
                {slotsForDate(date).filter((slot) => available === null || available.includes(slot.value)).map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-divider bg-navy-soft px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-cream-faint">Service</p>
            <p className="mt-1 text-sm font-semibold text-cream">Personal Training · 60 min</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">
              Note (optional)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know?"
            />
          </div>

          {error && (
            <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited">
              {error}
            </div>
          )}

          <Button type="submit" disabled={busy || loadingSlots || !date || !time} className="mt-1">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : done ? (
              <>
                <Check className="h-4 w-4" /> Request sent!
              </>
            ) : (
              "Send request"
            )}
          </Button>
          <p className="text-xs text-cream-faint">
            Times shown are open on your coach&apos;s Coach OS calendar. Your request still requires confirmation until IMS completes the Vagaro cutover.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
