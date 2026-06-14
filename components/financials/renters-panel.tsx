"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

interface Renter {
  id: string;
  name: string;
  discipline: string | null;
  monthly_rent_cents: number;
}

export function RentersPanel({ renters }: { renters: Renter[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [rent, setRent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!name.trim()) {
      setError("Name required");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/renters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        discipline: discipline.trim() || null,
        monthly_rent: Number(rent) || 0,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setDiscipline("");
      setRent("");
      setAdding(false);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not add renter");
    }
  }

  async function remove(id: string) {
    await fetch(`/api/renters/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Renters</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add renter
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {renters.length === 0 && !adding && (
          <p className="text-sm text-cream-faint">
            No renters yet. Add practitioners who pay you fixed monthly rent.
          </p>
        )}

        {renters.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between border-b border-divider/50 pb-2 last:border-0"
          >
            <div>
              <div className="text-sm text-cream">{r.name}</div>
              {r.discipline && (
                <div className="text-xs text-cream-faint">{r.discipline}</div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-cream">
                {formatCurrency(r.monthly_rent_cents)}/mo
              </span>
              <button
                onClick={() => remove(r.id)}
                className="text-cream-faint hover:text-red-400 transition-colors"
                title="Remove renter"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {adding && (
          <div className="flex flex-col gap-2 rounded-lg border border-divider bg-navy-deep/30 p-3">
            <Input
              placeholder="Name (e.g. Kara Vasko)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Discipline (e.g. Massage Therapy)"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Monthly rent ($)"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={add} disabled={busy}>
                {busy ? "Adding…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
