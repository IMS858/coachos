"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Upload, Loader2, Check, X } from "lucide-react";
import { readVideoMeta, extractPoster, uploadWithProgress, formatDuration } from "@/lib/video";
import {
  compressVideo,
  canCompress,
  formatMB,
  COMPRESS_THRESHOLD_MB,
  QUALITY_PRESETS,
  type QualityKey,
} from "@/lib/compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { value: "mobility", label: "Mobility" },
  { value: "strength", label: "Strength" },
  { value: "conditioning", label: "Conditioning" },
  { value: "general", label: "General" },
] as const;

/**
 * Send a client a coaching video.
 *
 * Two entry points on purpose: "Record" opens the phone camera directly
 * (capture="environment"), which is the realistic path — film the cue on the
 * gym floor right after the session while it's fresh. "Upload" covers anything
 * already shot.
 *
 * The file goes browser → Supabase Storage via a signed URL, never through an
 * API route, because Vercel caps a request body at ~4.5MB.
 */
export function SendVideoPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const recordRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<string>("mobility");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [meta, setMeta] = useState<{ duration: number } | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState<Blob | null>(null);
  const [shrink, setShrink] = useState(true);
  const [quality, setQuality] = useState<QualityKey>("standard");
  const [saved, setSaved] = useState<{ from: number; to: number } | null>(null);
  const [done, setDone] = useState<null | "sent" | "sent-notified">(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setDone(null);
    if (f.size > 500 * 1024 * 1024) {
      setError("That file is over 500MB. Trim it or record a shorter clip.");
      return;
    }
    setFile(f);
    setMeta(null);
    setPoster(null);
    setPosterUrl(null);
    if (!title) {
      // A sensible default the coach can overwrite.
      setTitle(f.type.startsWith("video") ? "Mobility homework" : "Reference photo");
    }

    // Pull duration and a still immediately, so the coach sees what they shot
    // rather than a filename.
    if (f.type.startsWith("video")) {
      void (async () => {
        try {
          const m = await readVideoMeta(f);
          setMeta({ duration: m.duration });
          const blob = await extractPoster(f);
          if (blob) {
            setPoster(blob);
            setPosterUrl(URL.createObjectURL(blob));
          }
        } catch {
          // Non-fatal: the clip still uploads without a poster.
        }
      })();
    }
  }

  async function send() {
    if (!file || !title.trim()) return;
    setBusy(true);
    setError(null);
    setPct(0);
    try {
      let toUpload: File = file;
      setSaved(null);

      const worthShrinking =
        shrink &&
        canCompress() &&
        file.type.startsWith("video") &&
        file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024;

      if (worthShrinking) {
        setProgress("Shrinking");
        const preset = QUALITY_PRESETS[quality];
        const result = await compressVideo(file, {
          maxHeight: preset.maxHeight,
          bitrate: preset.bitrate,
          onProgress: setPct,
        });
        if (!result.skipped) {
          toUpload = result.file;
          setSaved({ from: result.originalBytes, to: result.compressedBytes });
        }
        setPct(0);
      }

      const ext = (toUpload.name.split(".").pop() || "mp4").toLowerCase();

      setProgress("Preparing…");
      const urlRes = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, ext }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "Couldn't start the upload.");

      setProgress("Uploading");
      await uploadWithProgress(urlData.signedUrl, toUpload, setPct);

      // Poster is a nicety — never fail the send over it.
      let posterPath: string | null = null;
      if (poster) {
        try {
          setProgress("Finishing");
          const pRes = await fetch("/api/media/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              ext: "jpg",
              base: urlData.base,
              poster: true,
            }),
          });
          const pData = await pRes.json();
          if (pRes.ok) {
            await uploadWithProgress(pData.signedUrl, poster, () => {});
            posterPath = pData.path;
          }
        } catch {
          /* keep going without a poster */
        }
      }

      setProgress("Sending");
      const saveRes = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          title: title.trim(),
          note: note.trim(),
          category,
          kind: toUpload.type.startsWith("image") ? "image" : "video",
          storage_path: urlData.path,
          poster_path: posterPath,
          duration_seconds: meta?.duration ?? null,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error ?? "Couldn't save.");

      setDone(saveData.notified ? "sent-notified" : "sent");
      setFile(null);
      setTitle("");
      setNote("");
      setPoster(null);
      setPosterUrl(null);
      setMeta(null);
      router.refresh();
      setTimeout(() => setDone(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      setProgress(null);
      setPct(0);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-sky/10 flex items-center justify-center shrink-0">
          <Video className="h-4 w-4 text-sky" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-cream">Send homework</h3>
          <p className="prose-ims text-sm text-cream-dim mt-0.5">
            Film the cue while it&apos;s fresh — {clientName.split(" ")[0]} sees it
            on their plan.
          </p>
        </div>
      </div>

      {/* capture opens the camera on a phone; falls back to a file picker on desktop */}
      <input
        ref={recordRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!file ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => recordRef.current?.click()}>
            <Video className="h-4 w-4" /> Record
          </Button>
          <Button variant="secondary" size="sm" onClick={() => uploadRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md border border-divider bg-navy-elev p-2">
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={posterUrl}
                alt=""
                className="h-14 w-20 rounded object-cover bg-black shrink-0"
              />
            ) : (
              <div className="h-14 w-20 rounded bg-navy-deep flex items-center justify-center shrink-0">
                <Video className="h-5 w-5 text-cream-faint" />
              </div>
            )}
            <span className="text-sm text-cream truncate flex-1 min-w-0">
              {file.name}
              <span className="block text-xs text-cream-faint">
                {(file.size / 1024 / 1024).toFixed(1)}MB
                {meta?.duration ? ` · ${formatDuration(meta.duration)}` : ""}
              </span>
              {meta?.duration && meta.duration > 90 && (
                <span className="block text-xs text-status-moderate mt-0.5">
                  Over 90s — a 30-45s cue loads almost instantly and tends to
                  get rewatched more.
                </span>
              )}
            </span>
            <button
              onClick={() => setFile(null)}
              className="text-cream-faint hover:text-cream shrink-0"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hip 90/90 PAILs — daily"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">Focus</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-md border py-2 text-sm transition-colors ${
                    category === c.value
                      ? "border-sky bg-sky/10 text-cream"
                      : "border-divider text-cream-dim hover:border-cream-faint"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">
              Coaching note (optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sets, reps, how often — and what to feel."
              className="w-full rounded-lg border border-divider bg-navy-elev px-3 py-2 text-sm text-cream focus:outline-none focus:border-sky"
            />
          </div>

          {busy && progress === "Uploading" && (
            <div>
              <div className="flex justify-between text-xs text-cream-faint mb-1">
                <span>Uploading</span>
                <span className="tabular">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-navy-elev overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {file.type.startsWith("video") &&
            canCompress() &&
            file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024 && (
              <label className="flex items-start gap-2 rounded-md border border-divider bg-navy-elev px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shrink}
                  onChange={(e) => setShrink(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-cream">
                  Shrink before sending
                  <span className="block text-xs text-cream-faint mt-0.5">
                    Clients watch on a phone, so this costs nothing visible and
                    loads far faster. Takes about as long as the clip runs
                    {meta?.duration ? ` (~${formatDuration(meta.duration)})` : ""}.
                  </span>
                </span>
              </label>
            )}

          {shrink &&
            file.type.startsWith("video") &&
            canCompress() &&
            file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024 && (
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((k) => {
                  const q = QUALITY_PRESETS[k];
                  const mins = meta?.duration ? meta.duration / 60 : 1;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setQuality(k)}
                      className={`rounded-md border p-3 text-left transition-colors ${
                        quality === k
                          ? "border-sky bg-sky/10 text-cream"
                          : "border-divider text-cream-dim hover:border-cream-faint"
                      }`}
                    >
                      <div className="font-medium text-sm">{q.label}</div>
                      <div className="text-xs text-cream-faint mt-0.5">{q.hint}</div>
                      <div className="text-[11px] text-cream-faint mt-1 tabular">
                        ≈{Math.max(1, Math.round(q.approxMbPerMin * mins))}MB
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

          {busy && progress === "Shrinking" && (
            <div>
              <div className="flex justify-between text-xs text-cream-faint mb-1">
                <span>Shrinking</span>
                <span className="tabular">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-navy-elev overflow-hidden">
                <div
                  className="h-full rounded-full bg-status-moderate transition-[width] duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          <Button onClick={send} disabled={busy || !title.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            {busy ? (progress ?? "Working") : `Send to ${clientName.split(" ")[0]}`}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-status-limited">{error}</p>}
      {done && (
        <p className="text-sm text-status-optimal flex items-start gap-1.5">
          <Check className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {done === "sent-notified"
              ? `Sent — ${clientName.split(" ")[0]} has been emailed.`
              : "Sent. It's on their plan (no email went out)."}
            {saved && (
              <span className="block text-xs text-cream-faint mt-0.5">
                Shrunk from {formatMB(saved.from)} to {formatMB(saved.to)}.
              </span>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
