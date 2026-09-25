"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Video, Upload, X } from "lucide-react";
import { uploadWithProgress } from "@/lib/video";
import { CAPTURE_JOINTS, VIDEO_MIMES, videoFileError, parseCapture } from "@/lib/exercises/capture";

type Client = { id: string; full_name: string };
type Form = { name: string; description: string; cues: string; joint: string; category: string; sets: string; reps: string; load: string; rest: string; tempo: string; client_id: string };
type Attempt = { id: string; program: string | null; form: Form; file: File | null; path: string | null; uploaded: boolean };
type Receipt = { name: string; slug: string; program: string | null };
const empty = (client: string): Form => ({ name: "", description: "", cues: "", joint: "shoulder", category: "mobility", sets: "", reps: "", load: "", rest: "", tempo: "", client_id: client });
const FIELD = "mt-1 min-h-11 w-full rounded-xl border border-divider bg-white px-3 py-2 text-base text-cream disabled:opacity-60";
export function AddExercisePanel({ clients, initialClientId = "" }: { clients: Client[]; initialClientId?: string }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null), upload = useRef<HTMLInputElement>(null);
  const lock = useRef(false), attempt = useRef<Attempt | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [pending, setPending] = useState(false);
  const [form, setForm] = useState(() => empty(clients.some(c => c.id === initialClientId) ? initialClientId : ""));
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null);
  const [pct, setPct] = useState(0), [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null), [receipt, setReceipt] = useState<Receipt | null>(null);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  function pick(value?: File) {
    if (!value || pending || busy) return;
    const problem = videoFileError(value);
    if (problem) { setError(problem); return; }
    setError(null); if (preview) URL.revokeObjectURL(preview); setFile(value); setPreview(URL.createObjectURL(value)); setPct(0);
  }
  async function save(addAnother: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      if (!attempt.current) attempt.current = { id: crypto.randomUUID(), program: form.client_id ? crypto.randomUUID() : null, form: { ...form }, file, path: null, uploaded: false };
      const action = attempt.current;
      const initial = action.form;
      // Validate before requesting storage or freezing the form.
      if (!pending) {
        try { parseCapture({ request_id: action.id, client_program_id: action.program, client_context_id: initial.client_id || null, name: initial.name, description: initial.description, category: initial.category, coaching_cues: initial.cues.split("\n").map(c => c.trim()).filter(Boolean), primary_joints: [initial.joint], video_storage_path: null, default_prescription: { sets: initial.sets, reps: initial.reps, load: initial.load, rest_seconds: initial.rest, tempo: initial.tempo } }, ""); }
        catch (validationError) { attempt.current = null; throw validationError; }
      }
      setPending(true);
      if (action.file && !action.uploaded) {
        setStage("Preparing original-quality video");
        const ext = action.file.name.split(".").pop()!.toLowerCase();
        const prep = await fetch("/api/media/exercise-upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: action.id, ext, size: action.file.size, mime: action.file.type || VIDEO_MIMES[ext as keyof typeof VIDEO_MIMES] }) });
        const p = await prep.json();
        if (!prep.ok || typeof p.storage_path !== "string") throw new Error(p.error || "Could not prepare video.");
        action.path = p.storage_path;
        if (!p.uploaded) {
          if (typeof p.signedUrl !== "string") throw new Error("Upload response is incomplete.");
          setStage("Uploading original video"); await uploadWithProgress(p.signedUrl, action.file.type ? action.file : new File([action.file], action.file.name, { type: VIDEO_MIMES[ext as keyof typeof VIDEO_MIMES] }), setPct);
        }
        action.uploaded = true;
      }
      setStage("Saving exercise and client draft");
      const values = action.form;
      const response = await fetch("/api/exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        request_id: action.id, client_program_id: action.program, client_context_id: values.client_id || null,
        name: values.name, description: values.description, coaching_cues: values.cues.split("\n").map(c => c.trim()).filter(Boolean),
        category: values.category, primary_joints: [values.joint], video_storage_path: action.path,
        default_prescription: { sets: values.sets, reps: values.reps, load: values.load, rest_seconds: values.rest, tempo: values.tempo },
      }) });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.exercise?.id || !result.exercise?.slug) throw new Error(result.error || "Save was not confirmed. Retry this same action.");
      setReceipt({ name: result.exercise.name, slug: result.exercise.slug, program: result.client_program_id ?? null });
      attempt.current = null; setPending(false); setFile(null); setPct(0); setForm(empty(values.client_id));
      if (camera.current) camera.current.value = "";
      if (upload.current) upload.current.value = "";
      setOpen(addAnother); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Keep this page open and retry."); }
    finally { lock.current = false; setBusy(false); setStage(""); }
  }
  const disabled = busy || pending;
  return <div className="w-full space-y-4">
    {receipt && <div role="status" className="rounded-2xl border border-status-optimal/30 bg-white p-4 text-sm"><p className="font-semibold">Saved: {receipt.name}</p><p className="mt-1 text-cream-dim">Private exercise{receipt.program ? " and linked client program draft" : ""} saved. No client notifications were sent.</p><div className="mt-2 flex flex-wrap gap-4"><Link className="min-h-11 py-3 font-semibold text-sky" href={`/library/${receipt.slug}`}>Open exercise & video →</Link>{receipt.program && <Link className="min-h-11 py-3 font-semibold text-sky" href={`/programs/${receipt.program}/library`}>Open client prescription →</Link>}</div></div>}
    {!open ? <div className="flex justify-end"><button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 font-semibold text-white"><Plus className="h-4 w-4"/>Add new exercise</button></div> : <section className="rounded-2xl border border-sky/30 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-sky">New IMS exercise</p><h2 className="mt-1 text-2xl font-semibold">Create it while you coach.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-cream-dim">Save the exercise, original demo and defaults together. Selecting a client also creates a private program draft—without requiring an assessment.</p></div><button type="button" disabled={disabled} onClick={() => setOpen(false)} aria-label="Close exercise form" className="flex min-h-11 min-w-11 items-center justify-center"><X className="h-5 w-5"/></button></div>
      <form onSubmit={e => { e.preventDefault(); void save(false); }} className="mt-4 space-y-4">
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Exercise details</legend>
          <label className="text-sm font-medium">Exercise name<input required minLength={2} maxLength={160} className={FIELD} placeholder="Shoulder Capsule CAR" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
          <label className="text-sm font-medium">Primary joint<select className={FIELD} value={form.joint} onChange={e => setForm({ ...form, joint: e.target.value })}>{CAPTURE_JOINTS.map(j => <option key={j} value={j}>{j.replaceAll("_", " ")}</option>)}</select></label>
          <label className="text-sm font-medium">Category<select className={FIELD} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{["mobility", "strength", "cardio", "recovery"].map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="text-sm font-medium">Client (optional)<select className={FIELD} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}><option value="">Library only</option>{clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">Quick description<textarea maxLength={2000} rows={2} className={FIELD} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label>
          <label className="text-sm font-medium sm:col-span-2">Coaching cues (up to eight, one per line)<textarea maxLength={1920} rows={3} className={FIELD} value={form.cues} onChange={e => setForm({ ...form, cues: e.target.value })}/></label>
        </fieldset>
        <fieldset disabled={disabled} className="space-y-3"><legend className="text-sm font-medium">Demonstration</legend><input ref={camera} type="file" accept="video/*" capture="environment" hidden onChange={e => pick(e.target.files?.[0])}/><input ref={upload} type="file" accept="video/mp4,video/quicktime,video/webm" hidden onChange={e => pick(e.target.files?.[0])}/><div className="flex flex-wrap gap-2"><button type="button" onClick={() => camera.current?.click()} className="min-h-11 rounded-xl border border-divider px-4 text-sm font-semibold"><Video className="mr-2 inline h-4 w-4"/>Record demo</button><button type="button" onClick={() => upload.current?.click()} className="min-h-11 rounded-xl border border-divider px-4 text-sm font-semibold"><Upload className="mr-2 inline h-4 w-4"/>Upload video</button></div>{file && <p className="break-all text-xs">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · Original quality</p>}{preview && <video src={preview} controls playsInline preload="metadata" className="max-h-72 w-full rounded-xl bg-black"/>}<p className="text-xs text-cream-faint">MP4, MOV or WebM, up to 500 MB. This workflow does not recompress the recording.</p></fieldset>
        <fieldset disabled={disabled} className="grid grid-cols-2 gap-3 sm:grid-cols-3"><legend className="mb-2 text-sm font-medium">Default prescription (optional)</legend>{([["sets", "Sets"], ["reps", "Reps / time"], ["load", "Load / RPE"], ["rest", "Rest (seconds)"], ["tempo", "Tempo"]] as const).map(([key,label]) => <label key={key} className="text-sm font-medium">{label}<input className={FIELD} type={key === "sets" || key === "rest" ? "number" : "text"} min={key === "sets" ? 1 : 0} max={key === "sets" ? 20 : key === "rest" ? 900 : undefined} maxLength={key === "load" ? 120 : 40} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}/></label>)}</fieldset>
        {busy && <div role="status"><p className="text-sm">{stage}</p><progress aria-label="Video upload progress" max={100} value={pct} className="mt-2 w-full"/></div>}
        {error && <div role="alert" className="rounded-xl border border-status-limited/30 p-3 text-sm text-status-limited">{error}<p className="mt-2">Retry keeps the same save reference and uploaded file; it does not start another exercise.</p></div>}
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || form.name.trim().length < 2} className="min-h-12 rounded-xl bg-sky px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : pending ? "Retry same save" : form.client_id ? "Save exercise + client draft" : "Save exercise draft"}</button><button type="button" disabled={busy || pending || form.name.trim().length < 2} onClick={() => void save(true)} className="min-h-12 rounded-xl border border-divider px-5 font-semibold disabled:opacity-50">Save & add another</button></div>
      </form>
    </section>}
  </div>;
}
