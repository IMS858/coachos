"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Dumbbell, Loader2, Search, X } from "lucide-react";
import { catalogLabel, filterCatalog, MAX_SET_EXERCISES, sourceTokens, type CatalogClient, type CatalogExercise, type SavedExerciseSet } from "@/lib/exercises/catalog";

const inputClass = "min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream outline-none focus-visible:ring-2 focus-visible:ring-sky";
const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-divider bg-white px-4 py-2 text-sm font-semibold text-cream transition hover:border-sky/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-50";

export function ExerciseCatalogBrowser({ exercises, clients, initialClientId, initialSet }: { exercises: CatalogExercise[]; clients: CatalogClient[]; initialClientId: string; initialSet: SavedExerciseSet | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [joint, setJoint] = useState("");
  const [equipment, setEquipment] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [shown, setShown] = useState(48);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSet?.canonical_ids ?? []);
  const [clientId, setClientId] = useState(initialSet?.client_id ?? initialClientId);
  const [name, setName] = useState(initialSet?.name ?? "Training exercise set");
  const [note, setNote] = useState(initialSet?.note ?? "");
  const [savedSet, setSavedSet] = useState(initialSet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const pendingCreate = useRef<{ id: string; signature: string } | null>(null);
  const signature = JSON.stringify({ selectedIds, clientId, name: name.trim(), note: note.trim() });
  const [savedSignature, setSavedSignature] = useState(initialSet ? JSON.stringify({ selectedIds: initialSet.canonical_ids, clientId: initialSet.client_id, name: initialSet.name, note: initialSet.note }) : "");
  const dirty = signature !== savedSignature && (selectedIds.length > 0 || savedSet !== null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(exercises.map(e => [e.canonical_id, e])), [exercises]);
  const categories = useMemo(() => [...new Set(exercises.map(e => e.category).filter((v): v is string => !!v))].sort(), [exercises]);
  const joints = useMemo(() => [...new Set(exercises.flatMap(e => sourceTokens(e.source_primary_joints)))].sort(), [exercises]);
  const equipmentOptions = useMemo(() => [...new Set(exercises.flatMap(e => sourceTokens(e.equipment)))].sort(), [exercises]);
  const filtered = useMemo(() => filterCatalog(exercises, { query, category, joint, equipment, selectedOnly }, selected), [exercises, query, category, joint, equipment, selectedOnly, selected]);
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.has(e.canonical_id));
  const missingIds = selectedIds.filter(id => !byId.has(id));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function toggle(id: string) {
    if (busy) return;
    setSuccess(false);
    setError(null);
    setSelectedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : ids.length < MAX_SET_EXERCISES ? [...ids, id] : ids);
  }
  function selectFiltered() {
    if (busy) return;
    setSuccess(false);
    const next = allFilteredSelected ? selectedIds.filter(id => !filtered.some(e => e.canonical_id === id)) : [...new Set([...selectedIds, ...filtered.map(e => e.canonical_id)])];
    if (next.length > MAX_SET_EXERCISES) { setError(`A set can contain up to ${MAX_SET_EXERCISES} source exercises.`); return; }
    setSelectedIds(next);
  }
  function move(id: string, direction: number) {
    setSuccess(false);
    setSelectedIds(ids => {
      const index = ids.indexOf(id), target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return ids;
      const next = [...ids]; [next[index], next[target]] = [next[target], next[index]]; return next;
    });
  }
  function startNew() {
    if (dirty && !window.confirm("Start a new set and discard these unsaved changes?")) return;
    setSelectedIds([]); setName("Training exercise set"); setNote(""); setSavedSet(null); setSavedSignature(""); setSuccess(false); setError(null); pendingCreate.current = null;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !clientId || !selectedIds.length || missingIds.length) return;
    setBusy(true); setError(null); setSuccess(false);
    if (!savedSet && pendingCreate.current?.signature !== signature) pendingCreate.current = { id: crypto.randomUUID(), signature };
    const id = savedSet?.id ?? pendingCreate.current!.id;
    try {
      const response = await fetch("/api/library/sets", { method: savedSet ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        request_id: id, client_id: clientId, name: name.trim(), note: note.trim(), canonical_ids: selectedIds,
        ...(savedSet ? { expected_updated_at: savedSet.updated_at } : {}),
      }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "The set could not be saved. Your selections are still here.");
      if (!result?.id || !result.updated_at) throw new Error("Save confirmation was incomplete. Retry to check the same save.");
      setSavedSet({ id: result.id, name: name.trim(), client_id: clientId, canonical_ids: selectedIds, note: note.trim(), updated_at: result.updated_at });
      setSavedSignature(signature); setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reach Coach OS. Your selections are still here."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-24">
    <header className="rounded-3xl bg-band px-5 py-7 text-white sm:px-7">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">IMS / Coaching workspace</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Your exercise library</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Browse your complete source database. Pick exercises, build a set, and save it to a client&apos;s profile for programming.</p>
      <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium"><span className="rounded-full bg-white/10 px-3 py-2">{exercises.length} source entries</span><span className="rounded-full bg-white/10 px-3 py-2">{categories.length} categories</span><a href="#exercise-selection" className="rounded-full bg-white px-3 py-2 text-sky-deep">{selectedIds.length} selected</a></div>
    </header>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-4" aria-label="Exercise browser">
        <div className="rounded-2xl border border-divider bg-white p-4 shadow-sm">
          <label htmlFor="catalog-search" className="mb-2 block text-sm font-semibold text-cream">Find an exercise</label>
          <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-cream-faint"/><input id="catalog-search" type="search" value={query} onChange={e => { setQuery(e.target.value); setShown(48); }} className={`${inputClass} pl-10`} placeholder="Name, joint, movement or EX number" /></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label htmlFor="catalog-category" className="mb-1 block text-xs text-cream-dim">Category</label><select id="catalog-category" className={inputClass} value={category} onChange={e => { setCategory(e.target.value); setShown(48); }}><option value="">All categories</option>{categories.map(v => <option key={v} value={v}>{catalogLabel(v)}</option>)}</select></div>
            <div><label htmlFor="catalog-joint" className="mb-1 block text-xs text-cream-dim">Joint / region</label><select id="catalog-joint" className={inputClass} value={joint} onChange={e => { setJoint(e.target.value); setShown(48); }}><option value="">All regions</option>{joints.map(v => <option key={v} value={v}>{catalogLabel(v)}</option>)}</select></div>
            <div><label htmlFor="catalog-equipment" className="mb-1 block text-xs text-cream-dim">Equipment</label><select id="catalog-equipment" className={inputClass} value={equipment} onChange={e => { setEquipment(e.target.value); setShown(48); }}><option value="">All equipment</option>{equipmentOptions.map(v => <option key={v} value={v}>{catalogLabel(v)}</option>)}</select></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><label className="inline-flex min-h-11 items-center gap-2 text-sm text-cream"><input type="checkbox" checked={selectedOnly} onChange={e => { setSelectedOnly(e.target.checked); setShown(48); }} className="h-5 w-5 accent-sky"/>Selected only</label><button type="button" className={buttonClass} disabled={busy || filtered.length === 0} onClick={selectFiltered}>{allFilteredSelected ? "Deselect results" : `Select results (${filtered.length})`}</button></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-cream-dim" aria-live="polite">Showing {Math.min(shown, filtered.length)} of {filtered.length} matching entries</p>{(query || category || joint || equipment || selectedOnly) && <button className="min-h-11 text-sm font-semibold text-sky" onClick={() => { setQuery(""); setCategory(""); setJoint(""); setEquipment(""); setSelectedOnly(false); setShown(48); }}>Clear filters</button>}</div>
        {filtered.length === 0 && <div className="rounded-2xl border border-divider bg-white p-7 text-sm text-cream-dim">No exercises match these filters. Your selected set is still preserved.</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.slice(0, shown).map(exercise => <article key={exercise.canonical_id} className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition ${selected.has(exercise.canonical_id) ? "border-sky ring-1 ring-sky/20" : "border-divider"}`}>
            <label className="flex min-h-14 cursor-pointer items-start gap-3"><input type="checkbox" checked={selected.has(exercise.canonical_id)} disabled={busy} onChange={() => toggle(exercise.canonical_id)} className="mt-1 h-5 w-5 shrink-0 accent-sky" aria-label={`Select ${exercise.canonical_name}`}/><span className="min-w-0"><span className="block text-base font-semibold leading-6 text-cream">{exercise.canonical_name}</span><span className="mt-1 block text-xs capitalize text-cream-dim">{catalogLabel(exercise.category)}</span></span></label>
            <div className="mt-3 flex flex-wrap gap-1.5">{sourceTokens(exercise.source_primary_joints).slice(0, 4).map(j => <span key={j} className="rounded-full bg-surface px-2.5 py-1 text-xs text-cream-dim">{catalogLabel(j)}</span>)}</div>
            <details className="mt-3 border-t border-divider pt-1"><summary className="cursor-pointer py-3 text-xs font-medium text-cream-dim">Exercise details <span className="ml-1 text-cream-faint">{exercise.canonical_id}</span></summary><dl className="space-y-2 pb-2 text-xs leading-5 text-cream-dim"><div><dt className="font-semibold text-cream">Movement</dt><dd>{catalogLabel(exercise.movement_pattern)}</dd></div><div><dt className="font-semibold text-cream">Equipment</dt><dd>{exercise.equipment || "Not specified in source"}</dd></div>{exercise.aliases && <div><dt className="font-semibold text-cream">Also known as</dt><dd>{exercise.aliases}</dd></div>}<div><dt className="font-semibold text-cream">Database link</dt><dd>{exercise.mapping_status === "coach_confirmed" && exercise.matched_exercise_id ? "Linked to Coach OS exercise. Publication is managed separately." : "Source entry available for coach selections; app exercise mapping remains separate."}</dd></div></dl></details>
          </article>)}
        </div>
        {shown < filtered.length && <button type="button" className={`${buttonClass} w-full`} onClick={() => setShown(n => n + 48)}>Show more exercises</button>}
      </section>

      <section id="exercise-selection" aria-label="Selected exercise set" className="scroll-mt-24 rounded-2xl border border-divider bg-white p-5 shadow-sm lg:sticky lg:top-5">
        <div className="flex items-start justify-between gap-2"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-cream"><Dumbbell aria-hidden="true" className="h-5 w-5 text-sky"/>Your exercise set</h2><p className="mt-1 text-xs leading-5 text-cream-dim">{selectedIds.length} selected · saved to the staff side of the client profile</p></div>{selectedIds.length > 0 && <button type="button" className="min-h-11 min-w-11 text-cream-dim" aria-label="Start a new exercise set" disabled={busy} onClick={startNew}><X className="mx-auto h-4 w-4"/></button>}</div>
        {selectedIds.length === 0 ? <p className="my-5 rounded-xl bg-surface p-4 text-sm leading-6 text-cream-dim">Select a few exercises from your library. You can mix categories and arrange their order here.</p> : <ol className="my-4 max-h-72 space-y-2 overflow-y-auto pr-1">{selectedIds.map((id, index) => <li key={id} className="rounded-xl border border-divider px-3 py-2"><p className="text-sm font-medium text-cream">{index + 1}. {byId.get(id)?.canonical_name ?? `Source unavailable: ${id}`}</p><div className="mt-1 flex items-center justify-end gap-1"><button type="button" className="min-h-11 min-w-11 rounded-lg hover:bg-surface disabled:opacity-30" aria-label={`Move ${byId.get(id)?.canonical_name ?? id} up`} disabled={busy || index === 0} onClick={() => move(id, -1)}><ArrowUp className="mx-auto h-4 w-4"/></button><button type="button" className="min-h-11 min-w-11 rounded-lg hover:bg-surface disabled:opacity-30" aria-label={`Move ${byId.get(id)?.canonical_name ?? id} down`} disabled={busy || index === selectedIds.length - 1} onClick={() => move(id, 1)}><ArrowDown className="mx-auto h-4 w-4"/></button><button type="button" className="min-h-11 min-w-11 rounded-lg hover:bg-surface" aria-label={`Remove ${byId.get(id)?.canonical_name ?? id}`} disabled={busy} onClick={() => toggle(id)}><X className="mx-auto h-4 w-4"/></button></div></li>)}</ol>}
        <form onSubmit={save} className="space-y-3">
          <div><label htmlFor="set-client" className="mb-1 block text-xs font-semibold text-cream-dim">Client</label><select id="set-client" className={inputClass} required value={clientId} disabled={busy || savedSet !== null} onChange={e => { setClientId(e.target.value); setSuccess(false); }}><option value="">Choose a client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.full_name}</option>)}</select></div>
          <div><label htmlFor="set-name" className="mb-1 block text-xs font-semibold text-cream-dim">Set name</label><input id="set-name" required maxLength={160} disabled={busy} className={inputClass} value={name} onChange={e => { setName(e.target.value); setSuccess(false); }} placeholder="e.g. Lower-body session"/></div>
          <div><label htmlFor="set-note" className="mb-1 block text-xs font-semibold text-cream-dim">Coach note (optional)</label><textarea id="set-note" maxLength={2000} rows={2} disabled={busy} className={inputClass} value={note} onChange={e => { setNote(e.target.value); setSuccess(false); }} placeholder="What you want to work on"/></div>
          {missingIds.length > 0 && <p role="alert" className="text-sm text-status-limited">Remove unavailable source entries before saving.</p>}
          {error && <p role="alert" className="rounded-xl border border-status-limited/30 p-3 text-sm text-status-limited">{error}</p>}
          <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky px-4 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-50" disabled={busy || !dirty || !selectedIds.length || !clientId || !name.trim() || !!missingIds.length}>{busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin"/> : <Check aria-hidden="true" className="h-4 w-4"/>}{busy ? "Saving selection…" : savedSet ? "Save changes" : "Save to client profile"}</button>
          <p className="text-xs leading-5 text-cream-faint">This saves a private coaching draft, not a published workout. It does not send a notification or change exercise approvals.</p>
        </form>
        {success && savedSet && <div role="status" className="mt-4 rounded-xl border border-sky/30 bg-sky/5 p-3 text-sm text-cream"><p className="font-semibold">Exercise set saved.</p><Link href={`/clients/${savedSet.client_id}#exercise-sets`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-sky underline">Open client profile</Link></div>}
        {savedSet && <button type="button" onClick={startNew} disabled={busy} className={`${buttonClass} mt-3 w-full`}>Start another set</button>}
      </section>
    </div>
    <details className="rounded-2xl border border-divider px-5"><summary className="cursor-pointer py-4 text-sm text-cream-dim">Library management</summary><div className="flex flex-wrap gap-3 pb-4"><Link href="/library?view=media" className={buttonClass}>Exercise media & details</Link><Link href="/exercise-reviews" className={buttonClass}>Mapping & publication checks</Link><Link href="/library/new" className={buttonClass}>Create an exercise</Link></div></details>
    {selectedIds.length > 0 && <a href="#exercise-selection" className="fixed inset-x-4 bottom-24 z-20 flex min-h-12 items-center justify-between rounded-2xl bg-band px-5 py-3 text-sm font-semibold text-white shadow-xl lg:hidden"><span>{selectedIds.length} exercises selected</span><span>Review set →</span></a>}
  </main>;
}
