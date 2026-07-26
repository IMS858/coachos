"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, Plus, Loader2, AlertCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  exerciseId: string;
  onClose: () => void;
}

interface Program {
  id: string;
  name: string;
  client_name: string;
  status: string;
}

const BLOCKS = [
  { value: "warmup", label: "Warm-up" },
  { value: "main", label: "Main work" },
  { value: "finisher", label: "Finisher" },
  { value: "cooldown", label: "Cool-down" },
];

export function AddToProgramModal({ exerciseId, onClose }: Props) {
  const router = useRouter();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  // Prescription
  const [block, setBlock] = useState("main");
  const [sets, setSets] = useState<number | "">(3);
  const [reps, setReps] = useState("8-12");
  const [load, setLoad] = useState("");
  const [restSeconds, setRestSeconds] = useState<number | "">(60);
  const [tempo, setTempo] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load active programs once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/programs?status=active");
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs ?? []);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filteredPrograms = programs.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q)
    );
  });

  async function handleSave() {
    if (!selectedProgramId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    const res = await fetch(`/api/programs/${selectedProgramId}/exercises`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id: exerciseId,
        block,
        sets: sets || null,
        reps: reps || null,
        load: load || null,
        rest_seconds: restSeconds || null,
        tempo: tempo || null,
        notes_trainer: notes || null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      const program = programs.find((p) => p.id === selectedProgramId);
      setSuccess(`Added to ${program?.name ?? "program"}.`);
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1100);
    } else {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? "Save failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-navy-base border border-divider rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
          <h2 className="text-lg font-semibold">Add to program</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-cream-faint hover:text-cream hover:bg-navy-elev"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Program picker */}
          <div>
            <Label>Program</Label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cream-faint pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search programs or client name…"
                className="w-full h-9 rounded-md border border-divider bg-navy-deep pl-9 pr-3 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky"
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-md border border-divider bg-navy-deep">
              {loading && (
                <div className="p-4 text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </div>
              )}
              {!loading && filteredPrograms.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-cream-faint italic">
                  {programs.length === 0
                    ? "No active programs. Create one first."
                    : `No programs match "${search}"`}
                </div>
              )}
              {filteredPrograms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProgramId(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between ${
                    selectedProgramId === p.id
                      ? "bg-sky/15 text-cream"
                      : "text-cream-dim hover:bg-navy-elev"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-cream truncate">{p.name}</div>
                    <div className="text-xs text-cream-faint truncate">
                      {p.client_name}
                    </div>
                  </div>
                  {selectedProgramId === p.id && (
                    <Check className="h-4 w-4 text-sky shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedProgramId && (
            <>
              {/* Block */}
              <div>
                <Label>Block</Label>
                <div className="grid grid-cols-4 gap-2">
                  {BLOCKS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => setBlock(b.value)}
                      className={`rounded-md border py-2 text-sm font-medium transition-colors ${
                        block === b.value
                          ? "border-sky bg-sky/10 text-cream"
                          : "border-divider text-cream-dim hover:border-cream-faint"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prescription */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label>Sets</Label>
                  <Input
                    type="number"
                    min={1}
                    value={sets}
                    onChange={(e) =>
                      setSets(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <Label>Reps</Label>
                  <Input
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    placeholder="8-12 or 30s"
                  />
                </div>
                <div>
                  <Label>Load</Label>
                  <Input
                    value={load}
                    onChange={(e) => setLoad(e.target.value)}
                    placeholder="RPE 7"
                  />
                </div>
                <div>
                  <Label>Rest (sec)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={restSeconds}
                    onChange={(e) =>
                      setRestSeconds(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Tempo (optional)</Label>
                <Input
                  value={tempo}
                  onChange={(e) => setTempo(e.target.value)}
                  placeholder="3-1-1-0 (eccentric-pause-concentric-pause)"
                />
              </div>

              <div>
                <Label>Notes (trainer-facing)</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Specific to this client's setup, regression options, etc."
                  className="w-full rounded-md border border-divider bg-navy-deep px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:ring-2 focus:ring-sky resize-none"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-status-limited/30 bg-status-limited/10 px-3 py-2 text-sm text-status-limited flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-status-optimal/30 bg-status-optimal/10 px-3 py-2 text-sm text-status-optimal flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-divider">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedProgramId || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add to program
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wider text-cream-faint mb-1.5">
      {children}
    </label>
  );
}
