"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, ExternalLink, Loader2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Assignment {
  id: string;
  block: string;
  sort_order: number;
  sets: number | null;
  reps: string | null;
  load: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  duration_seconds: number | null;
  notes_trainer: string | null;
  notes_client: string | null;
  exercises: {
    id: string;
    name: string;
    ims_label: string | null;
    slug: string;
    category: string;
    movement_pattern: string;
    coaching_cues: string[];
    video_id: string | null;
    video_provider: string;
    primary_joints: string[];
  };
}

interface BlockGroup {
  block: string;
  items: Assignment[];
}

interface Props {
  programId: string;
  grouped: BlockGroup[];
  isStaff: boolean;
}

const BLOCK_LABELS: Record<string, string> = {
  warmup: "Warm-up",
  main: "Main Work",
  finisher: "Finisher",
  cooldown: "Cool-down",
};

export function ProgramExercises({ programId, grouped, isStaff }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);\n  const [editingId,setEditingId]=useState<string|null>(null);\n  const [savingId,setSavingId]=useState<string|null>(null);\n  const [edit,setEdit]=useState({sets:"",reps:"",load:"",rest:"",tempo:"",notes:""});\n  const [saveError,setSaveError]=useState<string|null>(null);\n  function beginEdit(a:Assignment){setEditingId(a.id);setSaveError(null);setEdit({sets:a.sets?.toString()??"",reps:a.reps??"",load:a.load??"",rest:a.rest_seconds?.toString()??"0",tempo:a.tempo??"",notes:a.notes_client??""});}\n  async function savePrescription(a:Assignment){setSavingId(a.id);setSaveError(null);try{const response=await fetch(`/api/programs/assignments/${a.id}/prescription`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({sets:Number(edit.sets),reps:edit.reps,load:edit.load,rest_seconds:Number(edit.rest||0),tempo:edit.tempo,notes:edit.notes})});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error||"Could not save prescription.");setEditingId(null);startTransition(()=>router.refresh());}catch(e){setSaveError(e instanceof Error?e.message:"Could not save prescription.");}finally{setSavingId(null);}}

  async function removeAssignment(assignmentId: string) {
    if (!confirm("Remove this exercise from the program?")) return;
    setRemovingId(assignmentId);
    const res = await fetch(`/api/programs/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    setRemovingId(null);
    if (res.ok) {
      startTransition(() => router.refresh());
    } else {
      alert("Could not remove. Try again.");
    }
  }

  const totalCount = grouped.reduce((sum, g) => sum + g.items.length, 0);

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-sm text-cream-faint italic">
            No exercises yet. Add some from the Library.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ block, items }) =>
        items.length === 0 ? null : (
          <Card key={block}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {BLOCK_LABELS[block] ?? block}
                <span className="text-xs font-normal text-cream-faint">
                  ({items.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((a) => (
                <div
                  key={a.id}
                  className="rounded-md border border-divider bg-navy-deep p-3 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/library/${a.exercises.slug}`}
                        className="font-medium text-cream hover:text-sky-light inline-flex items-center gap-1.5"
                      >
                        {a.exercises.ims_label || a.exercises.name}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </Link>

                      {isStaff && editingId===a.id && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><input aria-label="Sets" placeholder="Sets" value={edit.sets} onChange={e=>setEdit({...edit,sets:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm"/><input aria-label="Reps" placeholder="Reps" value={edit.reps} onChange={e=>setEdit({...edit,reps:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm"/><input aria-label="Load" placeholder="Load / RPE" value={edit.load} onChange={e=>setEdit({...edit,load:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm"/><input aria-label="Rest seconds" placeholder="Rest sec" value={edit.rest} onChange={e=>setEdit({...edit,rest:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm"/><input aria-label="Tempo" placeholder="Tempo" value={edit.tempo} onChange={e=>setEdit({...edit,tempo:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm"/><input aria-label="Client note" placeholder="Client cue / note" value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})} className="min-h-10 rounded-lg border border-divider px-2 text-sm sm:col-span-3"/><div className="col-span-2 flex gap-2 sm:col-span-3"><button type="button" disabled={savingId===a.id} onClick={()=>void savePrescription(a)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-sky px-3 text-xs font-semibold text-white"><Check className="h-3 w-3"/>{savingId===a.id?"Saving…":"Save prescription"}</button><button type="button" onClick={()=>setEditingId(null)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-divider px-3 text-xs"><X className="h-3 w-3"/>Cancel</button></div>{saveError&&<p role="alert" className="col-span-2 text-xs text-status-limited sm:col-span-3">{saveError}</p>}</div>}\n\n                      {/* Prescription line */}
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-cream-dim">
                        {a.sets && (
                          <span>
                            <span className="font-semibold text-cream">{a.sets}</span> sets
                          </span>
                        )}
                        {a.reps && (
                          <span>
                            ×{" "}
                            <span className="font-semibold text-cream">{a.reps}</span>
                          </span>
                        )}
                        {a.load && (
                          <span className="text-status-moderate">{a.load}</span>
                        )}
                        {a.rest_seconds && (
                          <span className="text-cream-faint">
                            rest {a.rest_seconds}s
                          </span>
                        )}
                        {a.tempo && (
                          <span className="text-cream-faint">tempo {a.tempo}</span>
                        )}
                      </div>

                      {a.exercises.video_id && <div className="mt-2"><Link href={`/library/${a.exercises.slug}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-divider px-3 text-xs font-semibold text-sky">Video demo <ExternalLink className="h-3 w-3"/></Link></div>}\n\n                      {a.notes_client && (
                        <div className="mt-2 text-xs text-cream-dim italic">
                          {a.notes_client}
                        </div>
                      )}
                    </div>

                    {isStaff && (
                      <button
                        type="button"
                        onClick={() => removeAssignment(a.id)}
                        disabled={removingId === a.id}
                        className="p-1.5 rounded-md text-cream-faint hover:text-status-limited hover:bg-navy-elev opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove"
                      >
                        {removingId === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
