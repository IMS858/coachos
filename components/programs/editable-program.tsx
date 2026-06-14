"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Exercise {
  name: string;
  sets?: string;
  reps?: string;
  notes?: string;
}
interface Block {
  block: string;
  exercises: Exercise[];
}
interface Day {
  day_label: string;
  blocks: Block[];
}
interface ProgramData {
  name?: string;
  summary?: string;
  weeks?: number;
  sessions_per_week?: number;
  focus?: string;
  weekly_structure: Day[];
  progression_notes?: string;
  coach_cautions?: string;
}

export function EditableProgram({
  programId,
  initialData,
  initialStatus,
}: {
  programId: string;
  initialData: ProgramData;
  initialStatus: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<ProgramData>(initialData);
  const [status, setStatus] = useState(initialStatus);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function mutate(fn: (d: ProgramData) => void) {
    setData((prev) => {
      const copy: ProgramData = JSON.parse(JSON.stringify(prev));
      fn(copy);
      return copy;
    });
    setDirty(true);
  }

  async function save(newStatus?: string) {
    setSaving(true);
    const res = await fetch(`/api/programs/${programId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        name: data.name,
        ...(newStatus ? { status: newStatus } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      setSavedAt(Date.now());
      if (newStatus) setStatus(newStatus);
      setTimeout(() => setSavedAt(null), 2000);
      router.refresh();
    }
  }

  const inputCls =
    "bg-transparent border-b border-transparent hover:border-divider focus:border-sky focus:outline-none text-cream";

  return (
    <div className="flex flex-col gap-5">
      {/* Sticky save bar */}
      <div className="flex items-center justify-between gap-3 sticky top-0 z-10 bg-navy-deep/95 backdrop-blur py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-cream-faint">
            Status: {status}
          </span>
          {dirty && (
            <span className="text-xs text-amber-400">unsaved changes</span>
          )}
          {savedAt && (
            <span className="text-xs text-status-optimal flex items-center gap-1">
              <Check className="h-3 w-3" /> saved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
          {status === "draft" && (
            <Button size="sm" onClick={() => save("published")} disabled={saving}>
              Publish to client
            </Button>
          )}
        </div>
      </div>

      {/* Program meta */}
      <Card>
        <CardContent className="pt-5 flex flex-col gap-2">
          <input
            className={`${inputCls} text-lg font-semibold w-full`}
            value={data.name ?? ""}
            onChange={(e) => mutate((d) => (d.name = e.target.value))}
            placeholder="Program name"
          />
          <textarea
            className={`${inputCls} text-sm w-full resize-none`}
            rows={2}
            value={data.summary ?? ""}
            onChange={(e) => mutate((d) => (d.summary = e.target.value))}
            placeholder="Summary"
          />
          <div className="flex flex-wrap gap-4 text-xs text-cream-faint">
            <label className="flex items-center gap-1">
              Weeks:
              <input
                type="number"
                className={`${inputCls} w-12`}
                value={data.weeks ?? 4}
                onChange={(e) => mutate((d) => (d.weeks = Number(e.target.value)))}
              />
            </label>
            <label className="flex items-center gap-1">
              Sessions/wk:
              <input
                type="number"
                className={`${inputCls} w-12`}
                value={data.sessions_per_week ?? 3}
                onChange={(e) => mutate((d) => (d.sessions_per_week = Number(e.target.value)))}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Days */}
      {data.weekly_structure.map((day, di) => (
        <Card key={di}>
          <CardHeader className="flex flex-row items-center justify-between">
            <input
              className={`${inputCls} text-base font-medium flex-1`}
              value={day.day_label}
              onChange={(e) => mutate((d) => (d.weekly_structure[di].day_label = e.target.value))}
            />
            <button
              onClick={() => mutate((d) => d.weekly_structure.splice(di, 1))}
              className="text-cream-faint hover:text-red-400 ml-2"
              title="Remove day"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {day.blocks.map((blk, bi) => (
              <div key={bi}>
                <input
                  className={`${inputCls} text-xs uppercase tracking-widest text-sky mb-2`}
                  value={blk.block}
                  onChange={(e) => mutate((d) => (d.weekly_structure[di].blocks[bi].block = e.target.value))}
                />
                <div className="flex flex-col gap-2">
                  {blk.exercises.map((ex, ei) => (
                    <div key={ei} className="flex items-start gap-2 border-b border-divider/30 pb-2">
                      <div className="flex-1 flex flex-col gap-1">
                        <input
                          className={`${inputCls} text-sm w-full`}
                          value={ex.name}
                          placeholder="Exercise"
                          onChange={(e) => mutate((d) => (d.weekly_structure[di].blocks[bi].exercises[ei].name = e.target.value))}
                        />
                        <input
                          className={`${inputCls} text-xs text-cream-faint w-full`}
                          value={ex.notes ?? ""}
                          placeholder="coaching note"
                          onChange={(e) => mutate((d) => (d.weekly_structure[di].blocks[bi].exercises[ei].notes = e.target.value))}
                        />
                      </div>
                      <input
                        className={`${inputCls} text-xs w-10 text-center`}
                        value={ex.sets ?? ""}
                        placeholder="sets"
                        onChange={(e) => mutate((d) => (d.weekly_structure[di].blocks[bi].exercises[ei].sets = e.target.value))}
                      />
                      <input
                        className={`${inputCls} text-xs w-16 text-center`}
                        value={ex.reps ?? ""}
                        placeholder="reps"
                        onChange={(e) => mutate((d) => (d.weekly_structure[di].blocks[bi].exercises[ei].reps = e.target.value))}
                      />
                      <button
                        onClick={() => mutate((d) => d.weekly_structure[di].blocks[bi].exercises.splice(ei, 1))}
                        className="text-cream-faint hover:text-red-400 mt-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => mutate((d) => d.weekly_structure[di].blocks[bi].exercises.push({ name: "", sets: "", reps: "" }))}
                    className="text-xs text-sky hover:underline flex items-center gap-1 mt-1"
                  >
                    <Plus className="h-3 w-3" /> add exercise
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Coach notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-cream-faint">Progression</label>
            <textarea
              className={`${inputCls} text-sm w-full resize-none`}
              rows={2}
              value={data.progression_notes ?? ""}
              onChange={(e) => mutate((d) => (d.progression_notes = e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs text-cream-faint">Cautions</label>
            <textarea
              className={`${inputCls} text-sm w-full resize-none`}
              rows={2}
              value={data.coach_cautions ?? ""}
              onChange={(e) => mutate((d) => (d.coach_cautions = e.target.value))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
