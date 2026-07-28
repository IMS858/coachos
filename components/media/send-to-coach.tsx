"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadWithProgress } from "@/lib/video";

/**
 * Client → coach. A photo of a swollen ankle, or a clip of something that
 * doesn't feel right, without waiting for the next session.
 *
 * capture="environment" opens the rear camera straight away, because the
 * realistic moment for this is standing in a kitchen looking at an ankle.
 */
export function SendToCoach() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setDone(false);
    if (f.size > 200 * 1024 * 1024) {
      setError("That file's too large — try a photo or a shorter clip.");
      return;
    }
    setFile(f);
    setPreviewUrl(f.type.startsWith("image") ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setNote("");
    setPct(0);
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const urlRes = await fetch(`/api/media/client-upload?ext=${ext}`);
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "Couldn't start the upload.");

      await uploadWithProgress(urlData.signedUrl, file, setPct);

      const saveRes = await fetch("/api/media/client-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: urlData.path,
          note,
          kind: file.type.startsWith("video") ? "video" : "image",
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error ?? "Couldn't send.");

      setDone(true);
      reset();
      setTimeout(() => setDone(false), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-navy-soft p-5 flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-cream">Send Jason a photo</h3>
        <p className="prose-ims text-sm text-cream-dim mt-0.5">
          Something swollen, sore, or a movement that doesn&apos;t feel right —
          send it and he&apos;ll take a look before your next session.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      {!file ? (
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          <Camera className="h-4 w-4" /> Take a photo or video
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-md border border-divider bg-navy-elev p-2">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-16 w-16 rounded object-cover shrink-0" />
            ) : (
              <div className="h-16 w-16 rounded bg-navy-deep flex items-center justify-center shrink-0">
                <Camera className="h-5 w-5 text-cream-faint" />
              </div>
            )}
            <span className="text-sm text-cream truncate flex-1 min-w-0">
              {file.name}
              <span className="block text-xs text-cream-faint">
                {(file.size / 1024 / 1024).toFixed(1)}MB
              </span>
            </span>
            <button
              onClick={reset}
              className="text-cream-faint hover:text-cream shrink-0"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-cream-dim mb-1.5">
              What&apos;s going on?
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Rolled my ankle Saturday, still puffy and sore to walk on."
              className="w-full rounded-lg border border-divider bg-navy-elev px-3 py-2 text-sm text-cream focus:outline-none focus:border-sky"
            />
          </div>

          {busy && (
            <div className="h-2 rounded-full bg-navy-elev overflow-hidden">
              <div
                className="h-full rounded-full bg-sky transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <Button onClick={send} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? `Sending ${pct}%` : "Send to Jason"}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-status-limited">{error}</p>}
      {done && (
        <p className="text-sm text-status-optimal flex items-center gap-1.5">
          <Check className="h-4 w-4" /> Sent — Jason&apos;s been notified.
        </p>
      )}
    </div>
  );
}
