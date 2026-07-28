"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { WAIVER_BY_TYPE, type WaiverDoc } from "@/lib/waivers";
import { Button } from "@/components/ui/button";

/**
 * Signing flow for a client who already has an account.
 *
 * Two things are deliberate and shouldn't be "simplified" away:
 *
 *   The signature pad stays disabled until they've scrolled to the bottom of
 *   the text. A waiver's enforceability rests on having actually been
 *   presented — a one-tap accept is the version that fails in a dispute.
 *
 *   Only the documents that lapsed are shown. Making someone re-sign four
 *   agreements to renew one is how you train people to scroll past without
 *   reading, which defeats the point.
 */
export function ResignFlow({ types }: { types: WaiverDoc["type"][] }) {
  const router = useRouter();
  const docs = types.map((t) => WAIVER_BY_TYPE[t]).filter(Boolean);

  const [idx, setIdx] = useState(0);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [scrolledEnd, setScrolledEnd] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [hasMark, setHasMark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doc = docs[idx];

  function ctx() {
    const c = canvasRef.current;
    if (!c) return null;
    const g = c.getContext("2d");
    if (g) {
      g.strokeStyle = "#17191c";
      g.lineWidth = 2;
      g.lineCap = "round";
      g.lineJoin = "round";
    }
    return g;
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
    if (!c || !hasMark) return;
    setSigned((s) => ({ ...s, [doc.type]: c.toDataURL("image/png") }));
    clear();
    setScrolledEnd(false);
    if (idx < docs.length - 1) setIdx(idx + 1);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/waivers/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waivers: signed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  }

  const allDone = docs.every((d) => signed[d.type]);

  if (allDone) {
    return (
      <div className="rounded-lg border border-divider bg-navy-soft p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-status-optimal mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-cream">All signed</h2>
        <p className="prose-ims text-sm text-cream-dim mt-1 mb-4">
          Thanks — that's you set for the next year.
        </p>
        {error && <p className="text-sm text-status-limited mb-3">{error}</p>}
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Finish
        </Button>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="rounded-lg border border-divider bg-navy-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-divider flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-cream">{doc.title}</h2>
        <span className="text-xs text-cream-faint shrink-0 tabular">
          {idx + 1} / {docs.length}
        </span>
      </div>

      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
            setScrolledEnd(true);
          }
        }}
        className="max-h-72 overflow-y-auto px-5 py-4 prose-ims text-sm text-cream-dim whitespace-pre-wrap"
      >
        {doc.body}
      </div>

      <div className="px-5 py-4 border-t border-divider">
        {!scrolledEnd && (
          <p className="text-xs text-cream-faint mb-2">
            Scroll to the bottom to sign.
          </p>
        )}
        <div
          className={`rounded-md border bg-white transition-opacity ${
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
          <button
            type="button"
            onClick={clear}
            className="text-xs text-cream-faint hover:text-cream"
          >
            Clear
          </button>
          <Button size="sm" onClick={accept} disabled={!scrolledEnd || !hasMark}>
            Confirm signature
          </Button>
        </div>
      </div>
    </div>
  );
}
