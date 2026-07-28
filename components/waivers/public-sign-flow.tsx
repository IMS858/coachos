"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Doc = { type: string; title: string; body: string; version: string };

/**
 * Signing for someone with no account.
 *
 * Same discipline as the in-app flow — the pad stays locked until they've
 * scrolled to the end of each document — because the enforceability of these
 * rests on having genuinely been presented, and a public link is exactly where
 * that would be tempting to skip.
 */
export function PublicSignFlow({ token }: { token: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [hasMark, setHasMark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch(`/api/agreements/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setLoadError(
            d.error === "already_signed"
              ? "These documents have already been signed. Nothing further is needed."
              : d.error === "expired"
                ? "This link has expired. Ask IMS to send a new one."
                : "This link isn't valid. Check the address, or ask IMS to resend it."
          );
          return;
        }
        setDocs(d.docs ?? []);
        setNote(d.note ?? null);
        if (d.full_name) setName(d.full_name);
      })
      .catch(() => setLoadError("Couldn't load. Check your connection and try again."));
  }, [token]);

  function ctx() {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (g) {
      g.strokeStyle = "#17191c";
      g.lineWidth = 2;
      g.lineCap = "round";
      g.lineJoin = "round";
    }
    return g ?? null;
  }
  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function clear() {
    const c = canvasRef.current;
    const g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setHasMark(false);
  }

  function accept() {
    const c = canvasRef.current;
    if (!c || !hasMark || !docs) return;
    setSigned((s) => ({ ...s, [docs[idx].type]: c.toDataURL("image/png") }));
    clear();
    setScrolledEnd(false);
    if (idx < docs.length - 1) setIdx(idx + 1);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agreements/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatures: signed, full_name: name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't save.");
      setComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-divider bg-navy-soft p-6">
        <p className="prose-ims text-sm text-cream">{loadError}</p>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="rounded-lg border border-divider bg-navy-soft p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-status-optimal mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-cream">All signed</h2>
        <p className="prose-ims text-sm text-cream-dim mt-1">
          Thanks — a copy has been filed and IMS has been notified. You can close
          this page.
        </p>
      </div>
    );
  }

  if (!docs) {
    return (
      <p className="text-sm text-cream-faint flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }

  const allDone = docs.every((d) => signed[d.type]);
  const doc = docs[idx];

  if (allDone) {
    return (
      <div className="rounded-lg border border-divider bg-navy-soft p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-cream">One last thing</h2>
        <div>
          <label className="block text-xs font-medium text-cream-dim mb-1.5">
            Your full legal name
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="text-sm text-status-limited">{error}</p>}
        <Button onClick={submit} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {note && idx === 0 && (
        <p className="prose-ims text-sm text-cream-dim rounded-lg border border-divider bg-navy-soft px-4 py-3">
          {note}
        </p>
      )}

      <div className="rounded-lg border border-divider bg-navy-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-divider flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-cream">{doc.title}</h2>
          <span className="text-xs text-cream-faint tabular shrink-0">
            {idx + 1} / {docs.length}
          </span>
        </div>

        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolledEnd(true);
          }}
          className="max-h-80 overflow-y-auto px-5 py-4 prose-ims text-sm text-cream-dim whitespace-pre-wrap"
        >
          {doc.body}
        </div>

        <div className="px-5 py-4 border-t border-divider">
          {!scrolledEnd && (
            <p className="text-xs text-cream-faint mb-2">Scroll to the bottom to sign.</p>
          )}
          <div
            className={`rounded-md border bg-white ${
              scrolledEnd ? "border-divider" : "border-divider opacity-40 pointer-events-none"
            }`}
          >
            <canvas
              ref={canvasRef}
              width={600}
              height={140}
              className="w-full touch-none"
              onPointerDown={(e) => {
                if (!scrolledEnd) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const g = ctx();
                const p = pos(e);
                g?.beginPath();
                g?.moveTo(p.x, p.y);
                setDrawing(true);
                setHasMark(true);
              }}
              onPointerMove={(e) => {
                if (!drawing) return;
                const g = ctx();
                const p = pos(e);
                g?.lineTo(p.x, p.y);
                g?.stroke();
              }}
              onPointerUp={() => setDrawing(false)}
              onPointerLeave={() => setDrawing(false)}
            />
          </div>
          <div className="flex items-center justify-between gap-2 mt-3">
            <button onClick={clear} className="text-xs text-cream-faint hover:text-cream">
              Clear
            </button>
            <Button size="sm" onClick={accept} disabled={!scrolledEnd || !hasMark}>
              Confirm signature
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
