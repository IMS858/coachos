"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SESSION_TYPES = [
  { value: "training", label: "Personal Training" },
  { value: "mobility", label: "Mobility Coaching" },
  { value: "pilates", label: "Pilates" },
  { value: "massage", label: "Massage / Bodywork" },
  { value: "recovery", label: "Recovery (sauna, compression)" },
];

export function BookingForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("training");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          session_type: type,
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
        setError(data.error || "Couldn't send the request.");
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
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-cream-dim mb-1.5">Time</label>
              <Input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">Session type</label>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              {SESSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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

          <Button type="submit" disabled={busy || !date || !time} className="mt-1">
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
            We&apos;ll email you as soon as it&apos;s confirmed.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
