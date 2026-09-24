"use client";
import { useRef, useState } from "react";
import { CoachingPlayer } from "@/components/media/coaching-player";
export function ExerciseVideo({ exerciseId }: { exerciseId: string }) {
  const [video, setVideo] = useState<{ kind: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function open() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/exercises/${encodeURIComponent(exerciseId)}/video`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !["file", "embed"].includes(data.kind) || typeof data.url !== "string") throw new Error(data.error || "Demo is unavailable.");
      setVideo(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open demo."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-3">
    <button type="button" disabled={busy} onClick={() => void open()} className="min-h-11 rounded-xl border border-divider bg-white px-4 text-sm font-semibold text-sky">{busy ? "Opening…" : video ? "Refresh video access" : "Open exercise demo"}</button>
    {error && <p role="alert" className="text-sm text-status-limited">{error}</p>}
    {video && (video.kind === "file" ? <CoachingPlayer src={video.url} title="IMS exercise demonstration"/> : <iframe title="IMS exercise demonstration" src={video.url} allow="fullscreen; picture-in-picture" allowFullScreen className="aspect-video w-full rounded-xl border-0"/>)}
  </div>;
}
